package office

import (
	"context"
	"fmt"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/crmadmin"
)

// fileRow mirrors the public.office_files columns needed to resolve ACL and
// build the Document Server config.
type fileRow struct {
	ID          string  `json:"id"`
	Kind        string  `json:"kind"`
	Name        string  `json:"name"`
	StoragePath string  `json:"storage_path"`
	OwnerUserID *string `json:"owner_user_id"`
	GroupID     *string `json:"group_id"`
	UpdatedAt   string  `json:"updated_at"`
}

// FileSummary is an ACL-filtered Office library row returned to Harness.
type FileSummary struct {
	ID          string  `json:"id"`
	Kind        string  `json:"kind"`
	Name        string  `json:"name"`
	OwnerUserID *string `json:"owner_user_id"`
	GroupID     *string `json:"group_id"`
	UpdatedAt   string  `json:"updated_at"`
}

// OpenFileResult contains metadata and a short-lived OOXML download URL.
type OpenFileResult struct {
	FileSummary
	FileName    string `json:"file_name"`
	DownloadURL string `json:"download_url"`
	ExpiresIn   int    `json:"expires_in_seconds"`
}

// loadFile reads one office_files row by id.
func (h *Handler) loadFile(ctx context.Context, fileID string) (*fileRow, error) {
	var row fileRow
	found, err := h.sb.From("office_files").
		Select("id,kind,name,storage_path,owner_user_id,group_id,updated_at").
		Eq("id", fileID).
		MaybeSingle(ctx, &row)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, nil
	}
	return &row, nil
}

// ListAccessibleFiles lists personal and permitted group Office rows for a user.
func (h *Handler) ListAccessibleFiles(
	ctx context.Context,
	userID string,
	kind string,
	search string,
	limit int,
) ([]FileSummary, error) {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind != "" && kind != "docs" && kind != "sheets" && kind != "slides" {
		return nil, fmt.Errorf("invalid Office kind")
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}

	var memberships []struct {
		GroupID string `json:"group_id"`
	}
	if err := h.sb.From("group_members").
		Select("group_id").
		Eq("user_id", userID).
		Eq("is_active", "true").
		Exec(ctx, &memberships); err != nil {
		return nil, err
	}
	groupIDs := make([]string, 0, len(memberships))
	for _, membership := range memberships {
		if membership.GroupID != "" {
			groupIDs = append(groupIDs, membership.GroupID)
		}
	}

	isSystemAdmin := crmadmin.IsSystemAdmin(ctx, h.sb, userID)
	leaderKinds := map[string]bool{
		"docs":   h.isGlobalLeaderForModule(ctx, userID, "desktop_docs"),
		"sheets": h.isGlobalLeaderForModule(ctx, userID, "desktop_sheets"),
		"slides": h.isGlobalLeaderForModule(ctx, userID, "desktop_slides"),
	}
	query := h.sb.From("office_files").
		Select("id,kind,name,owner_user_id,group_id,updated_at")
	if kind != "" {
		query = query.Eq("kind", kind)
	}
	if term := strings.TrimSpace(search); term != "" {
		query = query.Ilike("name", "%"+term+"%")
	}
	if !isSystemAdmin {
		clauses := []string{"owner_user_id.eq." + userID}
		if len(groupIDs) > 0 {
			clauses = append(clauses, "group_id.in.("+strings.Join(groupIDs, ",")+")")
		}
		if kind != "" && leaderKinds[kind] {
			clauses = append(clauses, "group_id.not.is.null")
		} else if kind == "" {
			for _, officeKind := range []string{"docs", "sheets", "slides"} {
				if leaderKinds[officeKind] {
					clauses = append(clauses, "and(kind.eq."+officeKind+",group_id.not.is.null)")
				}
			}
		}
		query = query.Or(strings.Join(clauses, ","))
	}
	var rows []FileSummary
	if err := query.Order("updated_at", false).Limit(limit).Exec(ctx, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// OpenAccessibleFile validates row ACL and mints a five-minute signed URL.
func (h *Handler) OpenAccessibleFile(
	ctx context.Context,
	userID string,
	fileID string,
) (*OpenFileResult, error) {
	row, err := h.loadFile(ctx, strings.TrimSpace(fileID))
	if err != nil {
		return nil, err
	}
	if row == nil || !h.resolveAccess(ctx, userID, row).CanView {
		return nil, nil
	}
	const expiresIn = 5 * 60
	downloadURL, err := h.sb.StorageCreateSignedURL(ctx, officeFilesBucket, row.StoragePath, expiresIn)
	if err != nil {
		return nil, err
	}
	return &OpenFileResult{
		FileSummary: FileSummary{
			ID: row.ID, Kind: row.Kind, Name: row.Name,
			OwnerUserID: row.OwnerUserID, GroupID: row.GroupID, UpdatedAt: row.UpdatedAt,
		},
		FileName: displayFilename(row), DownloadURL: downloadURL, ExpiresIn: expiresIn,
	}, nil
}

// fileExtension maps an office_files.kind to its native OOXML extension.
func fileExtension(kind string) string {
	switch kind {
	case "docs":
		return "docx"
	case "sheets":
		return "xlsx"
	case "slides":
		return "pptx"
	default:
		return ""
	}
}

// documentServerType maps an office_files.kind to the OnlyOffice
// documentType used in editorConfig ("word" | "cell" | "slide").
func documentServerType(kind string) string {
	switch kind {
	case "docs":
		return "word"
	case "sheets":
		return "cell"
	case "slides":
		return "slide"
	default:
		return ""
	}
}

// contentTypeForKind returns the OOXML MIME type for a kind, matching the
// office-files bucket's allowed_mime_types (20260828_office_files.sql).
func contentTypeForKind(kind string) string {
	switch kind {
	case "docs":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case "sheets":
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	case "slides":
		return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	default:
		return "application/octet-stream"
	}
}

// displayFilename builds the download/editor title, defaulting to the kind
// when the row has no name yet (matches the Electron "Untitled" convention).
func displayFilename(row *fileRow) string {
	name := row.Name
	if name == "" {
		name = "Untitled"
	}
	return fmt.Sprintf("%s.%s", name, fileExtension(row.Kind))
}
