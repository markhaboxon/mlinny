export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      access_links: {
        Row: {
          account_id: string
          created_at: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "app_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          detail: string | null
          id: string
          login: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string | null
          id?: string
          login?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string | null
          id?: string
          login?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_accounts: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          first_login_at: string | null
          full_name: string | null
          group_id: string | null
          id: string
          kind: string
          last_seen_at: string | null
          login: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          first_login_at?: string | null
          full_name?: string | null
          group_id?: string | null
          id?: string
          kind?: string
          last_seen_at?: string | null
          login: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          first_login_at?: string | null
          full_name?: string | null
          group_id?: string | null
          id?: string
          kind?: string
          last_seen_at?: string | null
          login?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_accounts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_completions: {
        Row: {
          assignment_id: string
          completed_at: string
          id: string
          student_id: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string
          id?: string
          student_id?: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_completions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          created_at: string
          due_date: string | null
          group_id: string
          id: string
          level: string
          note: string | null
          target_student_id: string | null
          teacher_id: string
          title: string
          topic: string | null
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          group_id: string
          id?: string
          level?: string
          note?: string | null
          target_student_id?: string | null
          teacher_id: string
          title: string
          topic?: string | null
        }
        Update: {
          created_at?: string
          due_date?: string | null
          group_id?: string
          id?: string
          level?: string
          note?: string | null
          target_student_id?: string | null
          teacher_id?: string
          title?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_jobs: {
        Row: {
          job_key: string
          ran_at: string
        }
        Insert: {
          job_key: string
          ran_at?: string
        }
        Update: {
          job_key?: string
          ran_at?: string
        }
        Relationships: []
      }
      curriculum_entries: {
        Row: {
          created_at: string
          group_id: string
          id: string
          notes: string | null
          planned_date: string | null
          position: number
          taught_at: string | null
          teacher_id: string
          topic: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          notes?: string | null
          planned_date?: string | null
          position?: number
          taught_at?: string | null
          teacher_id: string
          topic: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          notes?: string | null
          planned_date?: string | null
          position?: number
          taught_at?: string | null
          teacher_id?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_entries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_progress: {
        Row: {
          day: string
          id: string
          user_id: string
        }
        Insert: {
          day: string
          id?: string
          user_id?: string
        }
        Update: {
          day?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      gemini_keys: {
        Row: {
          active: boolean
          added_by: string | null
          api_key: string
          created_at: string
          id: string
          label: string | null
        }
        Insert: {
          active?: boolean
          added_by?: string | null
          api_key: string
          created_at?: string
          id?: string
          label?: string | null
        }
        Update: {
          active?: boolean
          added_by?: string | null
          api_key?: string
          created_at?: string
          id?: string
          label?: string | null
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          student_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          student_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          body: string
          created_at: string
          group_id: string | null
          id: string
          teacher_id: string
        }
        Insert: {
          body: string
          created_at?: string
          group_id?: string | null
          id?: string
          teacher_id: string
        }
        Update: {
          body?: string
          created_at?: string
          group_id?: string | null
          id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          archived: boolean
          capacity: number
          created_at: string
          finished_at: string | null
          id: string
          join_code: string
          lesson_days: number[]
          lesson_time: string | null
          name: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          capacity?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          join_code: string
          lesson_days?: number[]
          lesson_time?: string | null
          name: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          capacity?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          join_code?: string
          lesson_days?: number[]
          lesson_time?: string | null
          name?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      learned_words: {
        Row: {
          created_at: string
          id: string
          translation: string | null
          user_id: string
          word: string
        }
        Insert: {
          created_at?: string
          id?: string
          translation?: string | null
          user_id?: string
          word: string
        }
        Update: {
          created_at?: string
          id?: string
          translation?: string | null
          user_id?: string
          word?: string
        }
        Relationships: []
      }
      mistakes: {
        Row: {
          correct_answer: string
          created_at: string
          explanation: string | null
          id: string
          question: string
          skill: string | null
          tag: string | null
          user_id: string
          wrong_answer: string | null
        }
        Insert: {
          correct_answer: string
          created_at?: string
          explanation?: string | null
          id?: string
          question: string
          skill?: string | null
          tag?: string | null
          user_id?: string
          wrong_answer?: string | null
        }
        Update: {
          correct_answer?: string
          created_at?: string
          explanation?: string | null
          id?: string
          question?: string
          skill?: string | null
          tag?: string | null
          user_id?: string
          wrong_answer?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          group_id: string | null
          id: string
          read: boolean
          recipient_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          read?: boolean
          recipient_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          read?: boolean
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          best_streak: number
          created_at: string
          daily_word_count: number
          difficulty: string
          email: string | null
          gender: string | null
          last_view: string | null
          last_visit: string | null
          level_chosen: string | null
          linny_intro_seen: boolean
          name: string | null
          onboarded: boolean
          placement_count: number | null
          placement_score: number | null
          placement_stars: number | null
          streak: number
          telegram_id: number | null
          telegram_linked_at: string | null
          telegram_username: string | null
          tg_daily_hour: number
          tg_reminders: boolean
          theme: string
          updated_at: string
          user_id: string
          vocab_bank_ready: boolean
          vocab_last_generated: string | null
          vocab_last_test_date: string | null
          vocab_setup_done: boolean
          vocab_source: string | null
        }
        Insert: {
          age?: number | null
          best_streak?: number
          created_at?: string
          daily_word_count?: number
          difficulty?: string
          email?: string | null
          gender?: string | null
          last_view?: string | null
          last_visit?: string | null
          level_chosen?: string | null
          linny_intro_seen?: boolean
          name?: string | null
          onboarded?: boolean
          placement_count?: number | null
          placement_score?: number | null
          placement_stars?: number | null
          streak?: number
          telegram_id?: number | null
          telegram_linked_at?: string | null
          telegram_username?: string | null
          tg_daily_hour?: number
          tg_reminders?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
          vocab_bank_ready?: boolean
          vocab_last_generated?: string | null
          vocab_last_test_date?: string | null
          vocab_setup_done?: boolean
          vocab_source?: string | null
        }
        Update: {
          age?: number | null
          best_streak?: number
          created_at?: string
          daily_word_count?: number
          difficulty?: string
          email?: string | null
          gender?: string | null
          last_view?: string | null
          last_visit?: string | null
          level_chosen?: string | null
          linny_intro_seen?: boolean
          name?: string | null
          onboarded?: boolean
          placement_count?: number | null
          placement_score?: number | null
          placement_stars?: number | null
          streak?: number
          telegram_id?: number | null
          telegram_linked_at?: string | null
          telegram_username?: string | null
          tg_daily_hour?: number
          tg_reminders?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
          vocab_bank_ready?: boolean
          vocab_last_generated?: string | null
          vocab_last_test_date?: string | null
          vocab_setup_done?: boolean
          vocab_source?: string | null
        }
        Relationships: []
      }
      scheduled_messages: {
        Row: {
          body: string
          created_at: string
          group_id: string | null
          id: string
          send_at: string
          sent_at: string | null
          teacher_id: string
        }
        Insert: {
          body: string
          created_at?: string
          group_id?: string | null
          id?: string
          send_at: string
          sent_at?: string | null
          teacher_id: string
        }
        Update: {
          body?: string
          created_at?: string
          group_id?: string | null
          id?: string
          send_at?: string
          sent_at?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_materials: {
        Row: {
          content: string
          created_at: string
          group_id: string | null
          id: string
          kind: string
          teacher_id: string
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: string
          teacher_id: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: string
          teacher_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_materials_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_links: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_state: {
        Row: {
          chat_id: number
          data: Json
          updated_at: string
        }
        Insert: {
          chat_id: number
          data?: Json
          updated_at?: string
        }
        Update: {
          chat_id?: number
          data?: Json
          updated_at?: string
        }
        Relationships: []
      }
      telegram_updates: {
        Row: {
          created_at: string
          update_id: number
        }
        Insert: {
          created_at?: string
          update_id: number
        }
        Update: {
          created_at?: string
          update_id?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vocab_bank: {
        Row: {
          cefr: string
          created_at: string
          id: string
          level_rank: number
          position: number
          translation: string | null
          used: boolean
          user_id: string
          word: string
        }
        Insert: {
          cefr?: string
          created_at?: string
          id?: string
          level_rank?: number
          position?: number
          translation?: string | null
          used?: boolean
          user_id?: string
          word: string
        }
        Update: {
          cefr?: string
          created_at?: string
          id?: string
          level_rank?: number
          position?: number
          translation?: string | null
          used?: boolean
          user_id?: string
          word?: string
        }
        Relationships: []
      }
      vocab_words: {
        Row: {
          assigned_date: string
          created_at: string
          example: string | null
          example_uz: string | null
          favorited_at: string | null
          id: string
          is_favorite: boolean
          learned_at: string | null
          pronunciation: string | null
          status: string
          topic: string | null
          translation: string
          user_id: string
          word: string
        }
        Insert: {
          assigned_date: string
          created_at?: string
          example?: string | null
          example_uz?: string | null
          favorited_at?: string | null
          id?: string
          is_favorite?: boolean
          learned_at?: string | null
          pronunciation?: string | null
          status?: string
          topic?: string | null
          translation: string
          user_id?: string
          word: string
        }
        Update: {
          assigned_date?: string
          created_at?: string
          example?: string | null
          example_uz?: string | null
          favorited_at?: string | null
          id?: string
          is_favorite?: boolean
          learned_at?: string | null
          pronunciation?: string | null
          status?: string
          topic?: string | null
          translation?: string
          user_id?: string
          word?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_group: {
        Args: { _lesson_days?: number[]; _name: string }
        Returns: {
          id: string
          join_code: string
          name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_group_member: {
        Args: { _gid: string; _uid: string }
        Returns: boolean
      }
      is_group_teacher: {
        Args: { _gid: string; _uid: string }
        Returns: boolean
      }
      join_group_by_code: {
        Args: { _code: string }
        Returns: {
          group_id: string
          group_name: string
        }[]
      }
      my_group: {
        Args: never
        Returns: {
          group_id: string
          group_name: string
          joined_at: string
          lesson_days: number[]
          members_count: number
          teacher_name: string
        }[]
      }
      teacher_group_activity: {
        Args: { _days?: number; _gid: string }
        Returns: {
          active: number
          day: string
          mistakes: number
        }[]
      }
      teacher_group_students: {
        Args: { _gid: string }
        Returns: {
          accuracy: number
          active_30: number
          active_7: number
          assignments_done: number
          assignments_total: number
          best_streak: number
          joined_at: string
          last_visit: string
          learned_count: number
          level_chosen: string
          mistakes_7: number
          mistakes_count: number
          mistakes_prev_7: number
          name: string
          self_days_14: number
          streak: number
          student_id: string
        }[]
      }
      teacher_group_summary: {
        Args: { _gid: string }
        Returns: {
          active_7: number
          active_today: number
          at_risk: number
          avg_accuracy: number
          avg_streak: number
          top_mistake_tag: string
          total_students: number
        }[]
      }
      teacher_group_top_mistakes: {
        Args: { _gid: string; _limit?: number }
        Returns: {
          cnt: number
          tag: string
        }[]
      }
      teacher_groups_overview: {
        Args: never
        Returns: {
          active_7: number
          active_today: number
          archived: boolean
          at_risk: number
          avg_accuracy: number
          avg_streak: number
          group_id: string
          join_code: string
          lesson_days: number[]
          name: string
          students: number
        }[]
      }
      teacher_student_activity: {
        Args: { _days?: number; _sid: string }
        Returns: {
          active: number
          day: string
          learned: number
          mistakes: number
        }[]
      }
      teacher_student_mistakes: {
        Args: { _limit?: number; _sid: string }
        Returns: {
          correct_answer: string
          created_at: string
          explanation: string
          question: string
          skill: string
          tag: string
          wrong_answer: string
        }[]
      }
      teacher_weekly_report: {
        Args: { _gid: string }
        Returns: {
          active_students: number
          assignments_done: number
          assignments_total: number
          best_student: string
          learned_words: number
          new_mistakes: number
          students: number
          total_active_days: number
          weakest_topic: string
        }[]
      }
      teaches_student: {
        Args: { _sid: string; _uid: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "student" | "teacher" | "school_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["student", "teacher", "school_admin"],
    },
  },
} as const
