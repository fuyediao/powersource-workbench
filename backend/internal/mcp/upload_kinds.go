package mcp

// uploadCategory distinguishes image uploads (converted to WebP server-side,
// mirroring Electron's canvas pipeline) from document uploads (stored as-is).
type uploadCategory string

const (
	uploadCategoryImage    uploadCategory = "image"
	uploadCategoryDocument uploadCategory = "document"
)

// uploadPatchKind describes how a successful upload updates Postgres after
// the bytes land in Storage.
type uploadPatchKind int

const (
	// patchSingleColumn upserts one URL column on the parent row (logo_url,
	// avatar_url), overwriting any previous value at the same object path.
	patchSingleColumn uploadPatchKind = iota
	// patchArrayColumn appends a URL string to a text[]/jsonb string-array
	// column (image_urls, contract_images, …), capped at MaxItems when set.
	patchArrayColumn
	// patchInsertRow inserts a new metadata row into TargetEntity's table
	// (customer_documents, opportunity_attachments) pointing at the object.
	patchInsertRow
	// patchArrayObject appends a {storage_path, file_name, mime_type,
	// byte_size} object to a jsonb array column (customer_visit_log.document_files).
	patchArrayObject
)

// uploadKind is one entry of the CRM media registry: where the bytes go in
// Storage, which row/column they patch, and what ACL gates the mutation. The
// registry intentionally mirrors Electron's existing buckets, path layouts,
// and desktop write gates so desktop and MCP agents produce the same rows.
type uploadKind struct {
	Key      string
	Desc     string
	Category uploadCategory

	Bucket   string
	Public   bool // true: return the Storage public URL; false: mint a signed GET
	MaxBytes int64
	// AllowedMIME lists acceptable source MIME types. For images this is the
	// browser/agent-declared MIME before WebP conversion.
	AllowedMIME []string

	// ParentEntity is read via getRecord to confirm the caller can already
	// see the row before any Storage write happens (e.g. "customers").
	// Empty when SelfOnly.
	ParentEntity string
	// SelfOnly bypasses ParentEntity and the desktop write ACL entirely: the
	// object belongs to the caller's own profile, keyed by acc.UserID
	// (profile_avatar only).
	SelfOnly bool

	// Table is the Postgres table patched once the upload succeeds.
	Table string
	// TargetEntity's write gate authorizes the mutation. Usually equals
	// ParentEntity, but differs when the write lands on a child table
	// (customer_documents, opportunity_attachments). Empty when SelfOnly.
	TargetEntity string
	// WriteAction is "update" for column patches, "insert" for new rows.
	WriteAction string

	Patch uploadPatchKind
	// Column is the patched column for patchSingleColumn/patchArrayColumn.
	Column string
	// MaxItems caps an array column; 0 means unlimited (matches Electron,
	// which does not cap competitor photos or KOL contract files either).
	MaxItems int
}

// imageSourceMIME lists the raster formats accepted before WebP conversion.
// GIF is intentionally excluded: Electron's canvas pipeline never emits it
// and animated GIFs would silently lose motion on conversion.
var imageSourceMIME = []string{"image/jpeg", "image/png", "image/webp"}

// documentMIME lists the PDF/Office formats accepted for document kinds,
// mirroring resolveMime in geocrm-electron's customer-documents-api.ts.
var documentMIME = []string{
	"application/pdf",
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

const (
	mib = 1 << 20
)

// uploadKinds is the Workbench media registry for tables that exist after
// the curated migrations (customer logos and the caller's profile avatar).
var uploadKinds = []uploadKind{
	{
		Key:          "customer_logo",
		Desc:         "Company logo shown on a customer record.",
		Category:     uploadCategoryImage,
		Bucket:       "customer-logos",
		Public:       true,
		MaxBytes:     5 * mib,
		AllowedMIME:  imageSourceMIME,
		ParentEntity: "customers",
		Table:        "customers",
		TargetEntity: "customers",
		WriteAction:  "update",
		Patch:        patchSingleColumn,
		Column:       "logo_url",
	},
	{
		Key:         "profile_avatar",
		Desc:        "The caller's own profile avatar. Self only; not usable on teammates.",
		Category:    uploadCategoryImage,
		Bucket:      "profile-avatars",
		Public:      true,
		MaxBytes:    5 * mib,
		AllowedMIME: imageSourceMIME,
		SelfOnly:    true,
		Table:       "profiles",
		Patch:       patchSingleColumn,
		Column:      "avatar_url",
	},
}

// uploadKindIndex allows O(1) lookup by kind key.
var uploadKindIndex = func() map[string]*uploadKind {
	index := make(map[string]*uploadKind, len(uploadKinds))
	for i := range uploadKinds {
		index[uploadKinds[i].Key] = &uploadKinds[i]
	}
	return index
}()

// lookupUploadKind resolves an upload kind key, or nil when unknown.
func lookupUploadKind(key string) *uploadKind {
	return uploadKindIndex[key]
}

// allowedUploadKinds returns the kind keys the caller may use, given their
// desktop ACL, sorted so the tool schema enum is stable between calls.
func allowedUploadKinds(acc *access) []string {
	out := make([]string, 0, len(uploadKinds))
	for i := range uploadKinds {
		if uploadKindAllowed(acc, &uploadKinds[i]) {
			out = append(out, uploadKinds[i].Key)
		}
	}
	return out
}

// allowedDocumentUploadKinds returns the document-category kind keys the
// caller may use, for the prepare_upload/finalize_upload tool enum.
func allowedDocumentUploadKinds(acc *access) []string {
	out := make([]string, 0, len(uploadKinds))
	for i := range uploadKinds {
		kind := &uploadKinds[i]
		if kind.Category == uploadCategoryDocument && uploadKindAllowed(acc, kind) {
			out = append(out, kind.Key)
		}
	}
	return out
}

// uploadKindAllowed reports whether the caller may currently attempt this
// upload kind, without checking a specific parent row (that happens per call
// via getRecord/authorizeWrite). SelfOnly kinds are always listed; other
// kinds require the caller to hold the target entity's write grant.
func uploadKindAllowed(acc *access, kind *uploadKind) bool {
	if kind.SelfOnly {
		return true
	}
	target := lookupEntity(kind.TargetEntity)
	if target == nil {
		return false
	}
	return authorizeWrite(acc, target, kind.WriteAction) == nil
}

// blockedWriteColumns lists table -> column sets that must not be written
// directly through create_record / update_record, because a dedicated
// upload tool owns the Storage side effect (path convention, WebP
// conversion, array/size caps). Agents are pointed at upload_file instead.
var blockedWriteColumns = func() map[string]map[string]bool {
	out := make(map[string]map[string]bool, len(uploadKinds))
	add := func(table, column string) {
		if column == "" {
			return
		}
		if out[table] == nil {
			out[table] = map[string]bool{}
		}
		out[table][column] = true
	}
	for _, kind := range uploadKinds {
		add(kind.Table, kind.Column)
	}
	// storage_path is only ever written by the upload tools, even though it
	// is not itself an uploadKind.Column (customer_documents / opportunity
	// attachments insert it as part of patchInsertRow).
	add("customer_documents", "storage_path")
	add("opportunity_attachments", "storage_path")
	return out
}()

// isBlockedWriteColumn reports whether create_record/update_record must
// reject a direct write to table.column.
func isBlockedWriteColumn(table, column string) bool {
	return blockedWriteColumns[table][column]
}
