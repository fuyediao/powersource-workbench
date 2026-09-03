export type Json = boolean | number | string | null | Json[] | {
  [key: string]: Json | undefined;
};

export interface Database {
  public: {
    CompositeTypes: Record<string, never>;
    Enums: Record<string, never>;
    Functions: Record<string, never>;
    Tables: {
      work_invitations: {
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          created_by: string;
          display_name?: string;
          expires_at: string;
          id?: string;
          revoked_at?: string | null;
          token_hash: string;
          username: string;
        };
        Relationships: [];
        Row: {
          accepted_at: string | null;
          created_at: string;
          created_by: string;
          display_name: string;
          expires_at: string;
          id: string;
          revoked_at: string | null;
          token_hash: string;
          username: string;
        };
        Update: {
          accepted_at?: string | null;
          display_name?: string;
          expires_at?: string;
          revoked_at?: string | null;
          token_hash?: string;
          username?: string;
        };
      };
      work_profiles: {
        Insert: {
          created_at?: string;
          display_name?: string;
          id: string;
          role?: "member" | "system_admin";
          status?: "active" | "disabled";
          updated_at?: string;
          username: string;
        };
        Relationships: [];
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          role: "member" | "system_admin";
          status: "active" | "disabled";
          updated_at: string;
          username: string;
        };
        Update: {
          display_name?: string;
          role?: "member" | "system_admin";
          status?: "active" | "disabled";
          updated_at?: string;
          username?: string;
        };
      };
    };
    Views: Record<string, never>;
  };
}
