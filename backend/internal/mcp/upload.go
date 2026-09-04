package mcp

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/idutil"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/webp"
)

// mcpMediaTmpDir is where the shared webp helper stages files for cwebp.
const mcpMediaTmpDir = "/tmp/geocrm-mcp-media"

// webpQuality and webpMaxEdge mirror Electron's canvas conversion defaults
// (DEFAULT_WEBP_QUALITY = 0.85, MAX_CANVAS_DIM = 4096 in image-upload.ts) so
// desktop and MCP uploads produce visually equivalent files.
const (
	webpQuality = 85
	webpMaxEdge = 4096
)

// signedURLTTLSeconds is how long a private-bucket download link stays valid.
const signedURLTTLSeconds = 3600

// maxSourceURLFetchBytes caps how many bytes uploadFile will read from a
// caller-supplied source_url before the per-kind MaxBytes check even runs.
const maxSourceURLFetchBytes = 60 * mib

// sourceURLHTTPClient fetches source_url payloads with a bounded timeout.
var sourceURLHTTPClient = &http.Client{Timeout: 30 * time.Second}

// uploadArgs is the decoded arguments payload shared by upload_file,
// prepare_upload, finalize_upload, and delete_file.
type uploadArgs struct {
	Kind       string `json:"kind"`
	ParentID   string `json:"parent_id"`
	Filename   string `json:"filename"`
	MimeType   string `json:"mime_type"`
	DataBase64 string `json:"data_base64"`
	SourceURL  string `json:"source_url"`
	ObjectPath string `json:"object_path"`
	ByteSize   int64  `json:"byte_size"`
	URL        string `json:"url"`
	RecordID   string `json:"record_id"`
}

// callUploadTool decodes uploadArgs and dispatches one of the four upload
// tools, matching the callTool error-handling contract of the entity tools.
func callUploadTool(ctx context.Context, sb *supabase.Client, acc *access, name string, rawArgs json.RawMessage) *toolResult {
	var args uploadArgs
	if len(rawArgs) > 0 {
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return errorResult("invalid arguments: " + err.Error())
		}
	}
	var (
		result map[string]any
		err    error
	)
	switch name {
	case toolUploadFile:
		result, err = uploadFile(ctx, sb, acc, args)
	case toolPrepareUpload:
		result, err = prepareUpload(ctx, sb, acc, args)
	case toolFinalizeUpload:
		result, err = finalizeUpload(ctx, sb, acc, args)
	case toolDeleteFile:
		result, err = deleteFile(ctx, sb, acc, args)
	default:
		return errorResult("unknown tool " + name)
	}
	if err != nil {
		return toolError(err)
	}
	return textResult(result)
}

// describeUploadKinds is the list_upload_kinds payload, limited to kinds the
// caller's desktop write grants currently allow.
func describeUploadKinds(acc *access) map[string]any {
	allowed := allowedUploadKinds(acc)
	out := make([]map[string]any, 0, len(allowed))
	for _, key := range allowed {
		kind := lookupUploadKind(key)
		item := map[string]any{
			"kind":         kind.Key,
			"description":  kind.Desc,
			"category":     string(kind.Category),
			"public":       kind.Public,
			"max_bytes":    kind.MaxBytes,
			"allowed_mime": kind.AllowedMIME,
		}
		if kind.SelfOnly {
			item["self_only"] = true
		} else {
			item["parent_entity"] = kind.ParentEntity
		}
		if kind.MaxItems > 0 {
			item["max_items"] = kind.MaxItems
		}
		if kind.Patch == patchInsertRow {
			item["creates_record_in"] = kind.TargetEntity
		}
		if kind.Category == uploadCategoryDocument {
			item["supports_prepare_finalize"] = true
		}
		out = append(out, item)
	}
	return map[string]any{
		"count": len(out),
		"kinds": out,
		"note": "Call upload_file with kind, parent_id (from the kind's parent_entity; omit when self_only), filename, mime_type, and exactly one of data_base64 or source_url. " +
			"Images are converted to WebP server-side. For document kinds over a few MB, call prepare_upload, PUT the raw bytes to upload_url, then call finalize_upload with the same kind/parent_id/object_path. " +
			"Never write logo_url, avatar_url, image URL arrays, or document arrays through create_record/update_record; those columns are rejected and point back here.",
	}
}

// resolveUploadKind looks up an upload kind and confirms the caller's grants
// currently allow it, without checking a specific parent row.
func resolveUploadKind(acc *access, key string) (*uploadKind, error) {
	kind := lookupUploadKind(key)
	if kind == nil {
		return nil, fmt.Errorf("unknown upload kind %q; call list_upload_kinds for the allowed set", key)
	}
	if !uploadKindAllowed(acc, kind) {
		return nil, fmt.Errorf("%w: %s is not available with your current grants", errForbidden, kind.Key)
	}
	return kind, nil
}

// authorizeUpload confirms the caller may read the parent row (proving scope)
// and holds the desktop write grant for the mutation this kind performs. It
// returns the parent row (nil for SelfOnly kinds, which bypass entity ACL
// entirely and use the caller's own user id instead).
func authorizeUpload(ctx context.Context, sb *supabase.Client, acc *access, kind *uploadKind, parentID string) (map[string]json.RawMessage, error) {
	if kind.SelfOnly {
		if !isUUID(acc.UserID) {
			return nil, errForbidden
		}
		return nil, nil
	}
	if strings.TrimSpace(parentID) == "" {
		return nil, fmt.Errorf("parent_id is required for kind %s", kind.Key)
	}
	parentEnt := lookupEntity(kind.ParentEntity)
	if parentEnt == nil {
		return nil, fmt.Errorf("mcp: upload kind %s has an unknown parent entity", kind.Key)
	}
	row, err := getRecord(ctx, sb, acc, parentEnt, parentID)
	if err != nil {
		return nil, err
	}
	targetEnt := lookupEntity(kind.TargetEntity)
	if targetEnt == nil {
		return nil, fmt.Errorf("mcp: upload kind %s has an unknown target entity", kind.Key)
	}
	if err := authorizeWrite(acc, targetEnt, kind.WriteAction); err != nil {
		return nil, err
	}
	return row, nil
}

// uploadFile ingests bytes (base64 or source_url), converts images to WebP,
// writes the object to Storage, and patches the owning row.
func uploadFile(ctx context.Context, sb *supabase.Client, acc *access, args uploadArgs) (map[string]any, error) {
	kind, err := resolveUploadKind(acc, args.Kind)
	if err != nil {
		return nil, err
	}
	parentRow, err := authorizeUpload(ctx, sb, acc, kind, args.ParentID)
	if err != nil {
		return nil, err
	}

	data, mimeType, err := ingestBytes(ctx, args, kind.MaxBytes)
	if err != nil {
		return nil, err
	}
	if err := validateMIME(kind, mimeType); err != nil {
		return nil, err
	}

	finalData, finalMIME, ext, err := prepareBytes(kind, data, mimeType, args.Filename)
	if err != nil {
		return nil, err
	}

	objectPath, err := buildObjectPath(kind, acc, args.ParentID, parentRow, ext)
	if err != nil {
		return nil, err
	}

	upsert := kind.Patch == patchSingleColumn
	if err := sb.StorageUpload(ctx, kind.Bucket, objectPath, finalData, finalMIME, upsert); err != nil {
		return nil, err
	}

	fileName := strings.TrimSpace(args.Filename)
	if fileName == "" {
		fileName = path.Base(objectPath)
	}

	result, err := applyUploadPatch(ctx, sb, acc, kind, args.ParentID, parentRow, objectPath, fileName, finalMIME, int64(len(finalData)))
	if err != nil {
		_ = sb.StorageRemove(ctx, kind.Bucket, []string{objectPath})
		return nil, err
	}
	return result, nil
}

// prepareUpload mints a signed PUT URL for a document kind so a local agent
// can upload bytes larger than the JSON-RPC body cap directly to Storage.
func prepareUpload(ctx context.Context, sb *supabase.Client, acc *access, args uploadArgs) (map[string]any, error) {
	kind, err := resolveUploadKind(acc, args.Kind)
	if err != nil {
		return nil, err
	}
	if kind.Category != uploadCategoryDocument {
		return nil, fmt.Errorf("prepare_upload/finalize_upload are for document kinds; use upload_file for %s", kind.Key)
	}
	parentRow, err := authorizeUpload(ctx, sb, acc, kind, args.ParentID)
	if err != nil {
		return nil, err
	}
	mimeType := strings.TrimSpace(args.MimeType)
	if mimeType != "" {
		if err := validateMIME(kind, mimeType); err != nil {
			return nil, err
		}
	}
	ext := extFromFilenameOrMIME(args.Filename, mimeType)
	objectPath, err := buildObjectPath(kind, acc, args.ParentID, parentRow, ext)
	if err != nil {
		return nil, err
	}
	uploadURL, _, err := sb.StorageCreateSignedUploadURL(ctx, kind.Bucket, objectPath)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"kind":         kind.Key,
		"bucket":       kind.Bucket,
		"object_path":  objectPath,
		"upload_url":   uploadURL,
		"method":       "PUT",
		"max_bytes":    kind.MaxBytes,
		"instructions": "PUT the raw file bytes to upload_url (a Content-Type header is optional but recommended), then call finalize_upload with the same kind, parent_id, and this object_path, plus filename, mime_type, and byte_size.",
	}, nil
}

// finalizeUpload verifies a signed-PUT object exists and patches the owning
// row, completing the prepare_upload flow.
func finalizeUpload(ctx context.Context, sb *supabase.Client, acc *access, args uploadArgs) (map[string]any, error) {
	kind, err := resolveUploadKind(acc, args.Kind)
	if err != nil {
		return nil, err
	}
	if kind.Category != uploadCategoryDocument {
		return nil, fmt.Errorf("finalize_upload is for document kinds; use upload_file for %s", kind.Key)
	}
	objectPath := strings.TrimSpace(args.ObjectPath)
	if objectPath == "" {
		return nil, errors.New("object_path is required (copy it from the matching prepare_upload response)")
	}
	parentRow, err := authorizeUpload(ctx, sb, acc, kind, args.ParentID)
	if err != nil {
		return nil, err
	}
	prefix, err := expectedPathPrefix(kind, args.ParentID, parentRow)
	if err != nil {
		return nil, err
	}
	if !strings.HasPrefix(objectPath, prefix) {
		return nil, fmt.Errorf("%w: object_path must start with %q for this kind and parent_id", errForbidden, prefix)
	}
	if args.MimeType != "" {
		if err := validateMIME(kind, args.MimeType); err != nil {
			return nil, err
		}
	}
	if args.ByteSize > 0 && args.ByteSize > kind.MaxBytes {
		return nil, fmt.Errorf("file is %d bytes, over the %d byte limit for kind %s", args.ByteSize, kind.MaxBytes, kind.Key)
	}
	if err := verifyObjectExists(ctx, sb, kind.Bucket, objectPath); err != nil {
		return nil, err
	}
	fileName := strings.TrimSpace(args.Filename)
	if fileName == "" {
		fileName = path.Base(objectPath)
	}
	return applyUploadPatch(ctx, sb, acc, kind, args.ParentID, parentRow, objectPath, fileName, args.MimeType, args.ByteSize)
}

// deleteFile removes an uploaded object and reverses the DB patch it made.
func deleteFile(ctx context.Context, sb *supabase.Client, acc *access, args uploadArgs) (map[string]any, error) {
	kind, err := resolveUploadKind(acc, args.Kind)
	if err != nil {
		return nil, err
	}
	if kind.Patch == patchInsertRow {
		return deleteInsertedFile(ctx, sb, acc, kind, args)
	}
	return deleteColumnFile(ctx, sb, acc, kind, args)
}

// deleteColumnFile handles patchSingleColumn / patchArrayColumn /
// patchArrayObject kinds: clear or shrink the column, then best-effort
// remove the underlying Storage object(s).
func deleteColumnFile(ctx context.Context, sb *supabase.Client, acc *access, kind *uploadKind, args uploadArgs) (map[string]any, error) {
	parentRow, err := authorizeUpload(ctx, sb, acc, kind, args.ParentID)
	if err != nil {
		return nil, err
	}
	rowID := args.ParentID
	if kind.SelfOnly {
		rowID = acc.UserID
	}

	var removedPath string
	var updateValue any

	switch kind.Patch {
	case patchSingleColumn:
		p, err := buildObjectPath(kind, acc, args.ParentID, parentRow, "webp")
		if err != nil {
			return nil, err
		}
		removedPath = p
		updateValue = nil

	case patchArrayColumn:
		target := strings.TrimSpace(args.URL)
		if target == "" {
			return nil, fmt.Errorf("url is required to remove one item from %s", kind.Column)
		}
		kept, found := removeString(stringArray(parentRow[kind.Column]), target)
		if !found {
			return nil, errNotFound
		}
		removedPath = storagePathFromURL(kind, target)
		updateValue = kept

	case patchArrayObject:
		target := strings.TrimSpace(args.URL)
		if target == "" {
			return nil, fmt.Errorf("url must carry the storage_path of the document to remove from %s", kind.Column)
		}
		kept, removed, found := removeDocumentFile(documentFileArray(parentRow[kind.Column]), target)
		if !found {
			return nil, errNotFound
		}
		removedPath = removed
		updateValue = kept

	default:
		return nil, fmt.Errorf("mcp: delete_file does not support patch kind for %s", kind.Key)
	}

	if err := sb.From(kind.Table).Eq("id", rowID).Update(map[string]any{kind.Column: updateValue}).Exec(ctx, nil); err != nil {
		return nil, err
	}
	if removedPath != "" {
		_ = sb.StorageRemove(ctx, kind.Bucket, []string{removedPath})
	}
	return map[string]any{"kind": kind.Key, "removed_path": removedPath}, nil
}

// deleteInsertedFile handles patchInsertRow kinds (customer_document,
// opportunity_attachment): delete the metadata row, then the object.
func deleteInsertedFile(ctx context.Context, sb *supabase.Client, acc *access, kind *uploadKind, args uploadArgs) (map[string]any, error) {
	recordID := strings.TrimSpace(args.RecordID)
	if recordID == "" {
		return nil, fmt.Errorf("record_id is required to delete a %s", kind.Key)
	}
	targetEnt := lookupEntity(kind.TargetEntity)
	if targetEnt == nil {
		return nil, fmt.Errorf("mcp: upload kind %s has an unknown target entity", kind.Key)
	}
	row, err := getRecord(ctx, sb, acc, targetEnt, recordID)
	if err != nil {
		return nil, err
	}
	if err := authorizeWrite(acc, targetEnt, "delete"); err != nil {
		return nil, err
	}
	storagePath := jsonString(row["storage_path"])
	if err := sb.From(kind.Table).Eq("id", recordID).Delete().Exec(ctx, nil); err != nil {
		return nil, err
	}
	if storagePath != "" {
		_ = sb.StorageRemove(ctx, kind.Bucket, []string{storagePath})
	}
	return map[string]any{"kind": kind.Key, "deleted": recordID, "removed_path": storagePath}, nil
}

// applyUploadPatch resolves the object's download URL and performs the DB
// side effect for a completed upload (single column, array append, array
// object append, or a new metadata row).
func applyUploadPatch(
	ctx context.Context,
	sb *supabase.Client,
	acc *access,
	kind *uploadKind,
	parentID string,
	parentRow map[string]json.RawMessage,
	objectPath, fileName, mimeType string,
	byteSize int64,
) (map[string]any, error) {
	fileURL, err := resolveObjectURL(ctx, sb, kind, objectPath)
	if err != nil {
		return nil, err
	}

	switch kind.Patch {
	case patchSingleColumn:
		rowID := parentID
		if kind.SelfOnly {
			rowID = acc.UserID
		}
		if err := sb.From(kind.Table).Eq("id", rowID).Update(map[string]any{kind.Column: fileURL}).Exec(ctx, nil); err != nil {
			return nil, err
		}

	case patchArrayColumn:
		existing := stringArray(parentRow[kind.Column])
		if kind.MaxItems > 0 && len(existing) >= kind.MaxItems {
			return nil, fmt.Errorf("%s already holds the maximum of %d items", kind.Column, kind.MaxItems)
		}
		updated := append(append([]string{}, existing...), fileURL)
		if err := sb.From(kind.Table).Eq("id", parentID).Update(map[string]any{kind.Column: updated}).Exec(ctx, nil); err != nil {
			return nil, err
		}

	case patchArrayObject:
		existing := documentFileArray(parentRow[kind.Column])
		if kind.MaxItems > 0 && len(existing) >= kind.MaxItems {
			return nil, fmt.Errorf("%s already holds the maximum of %d items", kind.Column, kind.MaxItems)
		}
		updated := append(append([]map[string]any{}, existing...), map[string]any{
			"storage_path": objectPath,
			"file_name":    fileName,
			"mime_type":    mimeType,
			"byte_size":    byteSize,
		})
		if err := sb.From(kind.Table).Eq("id", parentID).Update(map[string]any{kind.Column: updated}).Exec(ctx, nil); err != nil {
			return nil, err
		}

	case patchInsertRow:
		payload := insertRowPayload(kind, acc, parentID, parentRow, objectPath, fileName, mimeType, byteSize)
		var rows []map[string]json.RawMessage
		if err := sb.From(kind.Table).Insert([]map[string]any{payload}).Returning().Exec(ctx, &rows); err != nil {
			return nil, err
		}
		result := map[string]any{
			"kind": kind.Key, "bucket": kind.Bucket, "object_path": objectPath,
			"url": fileURL, "byte_size": byteSize, "mime_type": mimeType,
		}
		if len(rows) > 0 {
			result["record"] = rows[0]
		}
		return result, nil
	}

	return map[string]any{
		"kind": kind.Key, "bucket": kind.Bucket, "object_path": objectPath,
		"url": fileURL, "byte_size": byteSize, "mime_type": mimeType,
	}, nil
}

// insertRowPayload builds the row inserted for patchInsertRow kinds.
func insertRowPayload(kind *uploadKind, acc *access, parentID string, parentRow map[string]json.RawMessage, objectPath, fileName, mimeType string, byteSize int64) map[string]any {
	payload := map[string]any{
		"storage_path": objectPath,
		"file_name":    fileName,
		"byte_size":    byteSize,
		"mime_type":    mimeType,
		"uploaded_by":  acc.UserID,
	}
	switch kind.Key {
	case "customer_document":
		payload["customer_id"] = parentID
		if groupID := jsonString(parentRow["group_id"]); groupID != "" {
			payload["group_id"] = groupID
		}
	case "opportunity_attachment":
		payload["opportunity_id"] = parentID
	}
	return payload
}

// resolveObjectURL returns the public URL (cache-busted) for a public
// bucket, or a fresh signed GET URL for a private bucket.
func resolveObjectURL(ctx context.Context, sb *supabase.Client, kind *uploadKind, objectPath string) (string, error) {
	if kind.Public {
		return sb.PublicURL(kind.Bucket, objectPath) + "?v=" + strconv.FormatInt(time.Now().UnixMilli(), 10), nil
	}
	return sb.StorageCreateSignedURL(ctx, kind.Bucket, objectPath, signedURLTTLSeconds)
}

// verifyObjectExists probes a Storage object with a 1-byte range request so
// finalize_upload does not have to download the whole file to confirm the
// client's PUT actually landed.
func verifyObjectExists(ctx context.Context, sb *supabase.Client, bucket, objectPath string) error {
	resp, err := sb.StorageOpen(ctx, bucket, objectPath, "bytes=0-0", "")
	if err != nil {
		return fmt.Errorf("could not verify the uploaded object: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return fmt.Errorf("uploaded object not found at %s (status %d); PUT the file to upload_url before calling finalize_upload", objectPath, resp.StatusCode)
	}
	return nil
}

// buildObjectPath mirrors Electron's Storage path convention per kind so
// desktop and MCP-uploaded objects share the same RLS-relevant prefixes.
func buildObjectPath(kind *uploadKind, acc *access, parentID string, parentRow map[string]json.RawMessage, ext string) (string, error) {
	switch kind.Key {
	case "customer_logo":
		return acc.UserID + "/" + parentID + "/logo.webp", nil
	case "profile_avatar":
		return acc.UserID + "/avatar.webp", nil
	case "kol_avatar":
		return acc.UserID + "/" + parentID + "/avatar.webp", nil
	case "visit_log_image":
		return acc.UserID + "/" + parentID + "/" + idutil.UUIDv4() + ".webp", nil
	case "competitor_shop_photo":
		groupID := jsonString(parentRow["group_id"])
		if groupID == "" {
			return "", errors.New("competitor shop is missing group_id")
		}
		return groupID + "/" + parentID + "/" + uniqueSuffix(ext), nil
	case "competitor_product_photo":
		groupID := jsonString(parentRow["group_id"])
		shopID := jsonString(parentRow["shop_id"])
		if groupID == "" || shopID == "" {
			return "", errors.New("competitor line is missing group_id or shop_id")
		}
		return groupID + "/" + shopID + "/" + parentID + "-" + uniqueSuffix(ext), nil
	case "kol_contract_image", "kol_contract_file":
		groupID := jsonString(parentRow["group_id"])
		if groupID == "" {
			return "", errors.New("kol is missing group_id")
		}
		return groupID + "/" + parentID + "/" + uniqueSuffix(ext), nil
	case "product_catalog_obm":
		return parentID + "/" + idutil.UUIDv4() + ".webp", nil
	case "visit_log_document":
		return parentID + "/" + idutil.UUIDv4() + "." + ext, nil
	case "customer_document", "opportunity_attachment":
		return parentID + "/" + uniqueSuffix(ext), nil
	}
	return "", fmt.Errorf("mcp: no path builder for upload kind %s", kind.Key)
}

// expectedPathPrefix bounds the object_path a finalize_upload call may claim
// for a given kind/parent, so a caller cannot smuggle a path belonging to
// another parent or user into the DB patch.
func expectedPathPrefix(kind *uploadKind, parentID string, parentRow map[string]json.RawMessage) (string, error) {
	switch kind.Key {
	case "visit_log_document", "customer_document", "opportunity_attachment":
		return parentID + "/", nil
	case "kol_contract_file":
		groupID := jsonString(parentRow["group_id"])
		if groupID == "" {
			return "", errors.New("kol is missing group_id")
		}
		return groupID + "/" + parentID + "/", nil
	}
	return "", fmt.Errorf("mcp: no path prefix rule for upload kind %s", kind.Key)
}

// uniqueSuffix builds a collision-resistant filename segment.
func uniqueSuffix(ext string) string {
	stamp := strconv.FormatInt(time.Now().UnixMilli(), 10) + "-" + idutil.UUIDv4()[:8]
	if ext == "" {
		return stamp
	}
	return stamp + "." + ext
}

// ingestBytes decodes exactly one of data_base64 / source_url and enforces
// the kind's size cap before any Storage call is made.
func ingestBytes(ctx context.Context, args uploadArgs, maxBytes int64) (data []byte, mimeType string, err error) {
	hasBase64 := strings.TrimSpace(args.DataBase64) != ""
	hasURL := strings.TrimSpace(args.SourceURL) != ""
	switch {
	case hasBase64 && hasURL:
		return nil, "", errors.New("supply exactly one of data_base64 or source_url, not both")
	case hasBase64:
		data, err = decodeBase64(args.DataBase64)
	case hasURL:
		data, err = fetchSourceURL(ctx, args.SourceURL)
	default:
		return nil, "", errors.New("data_base64 or source_url is required")
	}
	if err != nil {
		return nil, "", err
	}
	if len(data) == 0 {
		return nil, "", errors.New("uploaded file is empty")
	}
	if int64(len(data)) > maxBytes {
		return nil, "", fmt.Errorf("file is %d bytes, over the %d byte limit for this kind", len(data), maxBytes)
	}
	mimeType = strings.TrimSpace(args.MimeType)
	if mimeType == "" {
		mimeType = http.DetectContentType(data)
	}
	return data, mimeType, nil
}

// decodeBase64 accepts a raw base64 string or a data: URL and returns the
// decoded bytes.
func decodeBase64(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "data:") {
		if idx := strings.Index(s, ","); idx >= 0 {
			s = s[idx+1:]
		}
	}
	data, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		data, err = base64.RawStdEncoding.DecodeString(s)
	}
	if err != nil {
		return nil, fmt.Errorf("data_base64 is not valid base64: %w", err)
	}
	return data, nil
}

// fetchSourceURL downloads a caller-supplied attachment URL, capped at
// maxSourceURLFetchBytes regardless of the eventual per-kind limit.
func fetchSourceURL(ctx context.Context, rawURL string) ([]byte, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, errors.New("source_url must be an http or https URL")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := sourceURLHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching source_url failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("source_url returned status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxSourceURLFetchBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > maxSourceURLFetchBytes {
		return nil, fmt.Errorf("source_url content exceeds %d bytes", maxSourceURLFetchBytes)
	}
	return body, nil
}

// validateMIME rejects a MIME type that is not on the kind's allowlist.
func validateMIME(kind *uploadKind, mimeType string) error {
	base := mimeType
	if idx := strings.Index(base, ";"); idx >= 0 {
		base = base[:idx]
	}
	base = strings.ToLower(strings.TrimSpace(base))
	for _, allowed := range kind.AllowedMIME {
		if base == allowed {
			return nil
		}
	}
	return fmt.Errorf("mime_type %q is not allowed for kind %s (allowed: %s)", mimeType, kind.Key, strings.Join(kind.AllowedMIME, ", "))
}

// prepareBytes converts image kinds to WebP via the shared helper, falling
// back to the original bytes when cwebp is unavailable rather than failing
// the upload closed. Document kinds pass through unchanged.
func prepareBytes(kind *uploadKind, data []byte, mimeType, filename string) (out []byte, outMIME, ext string, err error) {
	if kind.Category != uploadCategoryImage {
		return data, mimeType, extFromFilenameOrMIME(filename, mimeType), nil
	}
	converted, _, _, convErr := webp.Convert(data, webpQuality, webpMaxEdge, mcpMediaTmpDir)
	if convErr == nil {
		return converted, "image/webp", "webp", nil
	}
	if errors.Is(convErr, webp.ErrUnavailable) {
		return data, mimeType, extFromFilenameOrMIME(filename, mimeType), nil
	}
	return nil, "", "", fmt.Errorf("image conversion failed: %w", convErr)
}

// extFromFilenameOrMIME derives a lowercase file extension (without the dot)
// from the filename, falling back to the declared MIME type.
func extFromFilenameOrMIME(filename, mimeType string) string {
	if filename != "" {
		if ext := strings.TrimPrefix(strings.ToLower(path.Ext(filename)), "."); ext != "" {
			return ext
		}
	}
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "application/pdf":
		return "pdf"
	case "application/msword":
		return "doc"
	case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		return "docx"
	case "application/vnd.ms-excel":
		return "xls"
	case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
		return "xlsx"
	case "application/vnd.ms-powerpoint":
		return "ppt"
	case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
		return "pptx"
	case "image/jpeg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	}
	return "bin"
}

// storagePathFromURL strips a public-bucket URL down to its bucket-relative
// object path, or returns the input unchanged when it is already a bare path.
func storagePathFromURL(kind *uploadKind, rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	marker := "/object/public/" + kind.Bucket + "/"
	if idx := strings.Index(rawURL, marker); idx >= 0 {
		p := rawURL[idx+len(marker):]
		if q := strings.Index(p, "?"); q >= 0 {
			p = p[:q]
		}
		if decoded, err := url.QueryUnescape(p); err == nil {
			return decoded
		}
		return p
	}
	if !strings.Contains(rawURL, "://") {
		return rawURL
	}
	return ""
}

// stringArray decodes a text[]/jsonb string array column, tolerating null.
func stringArray(raw json.RawMessage) []string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var out []string
	if json.Unmarshal(raw, &out) == nil {
		return out
	}
	return nil
}

// documentFileArray decodes a jsonb array of {storage_path, file_name,
// mime_type, byte_size} objects (customer_visit_log.document_files).
func documentFileArray(raw json.RawMessage) []map[string]any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var out []map[string]any
	if json.Unmarshal(raw, &out) == nil {
		return out
	}
	return nil
}

// removeString drops the first occurrence of target from list.
func removeString(list []string, target string) ([]string, bool) {
	out := make([]string, 0, len(list))
	found := false
	for _, v := range list {
		if !found && v == target {
			found = true
			continue
		}
		out = append(out, v)
	}
	return out, found
}

// removeDocumentFile drops the document_files entry whose storage_path
// matches, returning the removed path for Storage cleanup.
func removeDocumentFile(list []map[string]any, storagePath string) (kept []map[string]any, removedPath string, found bool) {
	kept = make([]map[string]any, 0, len(list))
	for _, item := range list {
		sp, _ := item["storage_path"].(string)
		if !found && sp == storagePath {
			found = true
			removedPath = sp
			continue
		}
		kept = append(kept, item)
	}
	return kept, removedPath, found
}
