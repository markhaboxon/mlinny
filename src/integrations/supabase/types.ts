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
      ai_usage_daily: {
        Row: {
          day: string
          kind: string
          used: number
          user_id: string
        }
        Insert: {
          day?: string
          kind: string
          used?: number
          user_id: string
        }
        Update: {
          day?: string
          kind?: string
          used?: number
          user_id?: string
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
      coin_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          user_id?: string
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
      duel_matches: {
        Row: {
          created_at: string
          id: string
          is_bot: boolean
          p1: string
          p1_done: boolean
          p1_name: string | null
          p1_score: number
          p2: string | null
          p2_done: boolean
          p2_name: string | null
          p2_score: number
          questions: Json
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_bot?: boolean
          p1: string
          p1_done?: boolean
          p1_name?: string | null
          p1_score?: number
          p2?: string | null
          p2_done?: boolean
          p2_name?: string | null
          p2_score?: number
          questions?: Json
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_bot?: boolean
          p1?: string
          p1_done?: boolean
          p1_name?: string | null
          p1_score?: number
          p2?: string | null
          p2_done?: boolean
          p2_name?: string | null
          p2_score?: number
          questions?: Json
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      gemini_keys: {
        Row: {
          active: boolean
          added_by: string | null
          api_key: string
          calls_day: string | null
          calls_today: number
          calls_total: number
          cooldown_until: string | null
          created_at: string
          id: string
          label: string | null
          last_error: string | null
          last_ok_at: string | null
          owner_id: string | null
          scope: string
        }
        Insert: {
          active?: boolean
          added_by?: string | null
          api_key: string
          calls_day?: string | null
          calls_today?: number
          calls_total?: number
          cooldown_until?: string | null
          created_at?: string
          id?: string
          label?: string | null
          last_error?: string | null
          last_ok_at?: string | null
          owner_id?: string | null
          scope?: string
        }
        Update: {
          active?: boolean
          added_by?: string | null
          api_key?: string
          calls_day?: string | null
          calls_today?: number
          calls_total?: number
          cooldown_until?: string | null
          created_at?: string
          id?: string
          label?: string | null
          last_error?: string | null
          last_ok_at?: string | null
          owner_id?: string | null
          scope?: string
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
      ielts_attempts: {
        Row: {
          band: number | null
          created_at: string
          detail: Json
          id: string
          mock_id: string | null
          raw_score: number | null
          skill: string
          total: number | null
          user_id: string
          variant: string
        }
        Insert: {
          band?: number | null
          created_at?: string
          detail?: Json
          id?: string
          mock_id?: string | null
          raw_score?: number | null
          skill: string
          total?: number | null
          user_id: string
          variant?: string
        }
        Update: {
          band?: number | null
          created_at?: string
          detail?: Json
          id?: string
          mock_id?: string | null
          raw_score?: number | null
          skill?: string
          total?: number | null
          user_id?: string
          variant?: string
        }
        Relationships: []
      }
      ielts_materials: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          kind: string
          payload: Json
          section: number
          source: string
          title: string
          topic: string | null
          uses: number
          variant: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          payload: Json
          section?: number
          source?: string
          title: string
          topic?: string | null
          uses?: number
          variant?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          payload?: Json
          section?: number
          source?: string
          title?: string
          topic?: string | null
          uses?: number
          variant?: string
        }
        Relationships: []
      }
      ielts_sessions: {
        Row: {
          id: string
          material_ids: string[]
          mock_id: string | null
          practice: boolean
          prompt: Json | null
          skill: string
          started_at: string
          submitted_at: string | null
          user_id: string
          variant: string
        }
        Insert: {
          id?: string
          material_ids?: string[]
          mock_id?: string | null
          practice?: boolean
          prompt?: Json | null
          skill: string
          started_at?: string
          submitted_at?: string | null
          user_id: string
          variant?: string
        }
        Update: {
          id?: string
          material_ids?: string[]
          mock_id?: string | null
          practice?: boolean
          prompt?: Json | null
          skill?: string
          started_at?: string
          submitted_at?: string | null
          user_id?: string
          variant?: string
        }
        Relationships: []
      }
      known_devices: {
        Row: {
          approved: boolean
          city: string | null
          created_at: string
          fingerprint: string
          id: string
          ip: string | null
          label: string | null
          last_seen_at: string
          revoked: boolean
          user_id: string
        }
        Insert: {
          approved?: boolean
          city?: string | null
          created_at?: string
          fingerprint: string
          id?: string
          ip?: string | null
          label?: string | null
          last_seen_at?: string
          revoked?: boolean
          user_id: string
        }
        Update: {
          approved?: boolean
          city?: string | null
          created_at?: string
          fingerprint?: string
          id?: string
          ip?: string | null
          label?: string | null
          last_seen_at?: string
          revoked?: boolean
          user_id?: string
        }
        Relationships: []
      }
      league_history: {
        Row: {
          created_at: string
          id: string
          league: string
          result: string
          user_id: string
          week_start: string
          xp: number
        }
        Insert: {
          created_at?: string
          id?: string
          league: string
          result: string
          user_id: string
          week_start: string
          xp?: number
        }
        Update: {
          created_at?: string
          id?: string
          league?: string
          result?: string
          user_id?: string
          week_start?: string
          xp?: number
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
          user_id: string
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
      login_bans: {
        Row: {
          created_at: string
          ip: string
          reason: string | null
          until: string
        }
        Insert: {
          created_at?: string
          ip: string
          reason?: string | null
          until: string
        }
        Update: {
          created_at?: string
          ip?: string
          reason?: string | null
          until?: string
        }
        Relationships: []
      }
      login_requests: {
        Row: {
          account_id: string
          created_at: string
          device: string | null
          expires_at: string
          id: string
          status: string
        }
        Insert: {
          account_id: string
          created_at?: string
          device?: string | null
          expires_at?: string
          id?: string
          status?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          device?: string | null
          expires_at?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "app_accounts"
            referencedColumns: ["id"]
          },
        ]
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
          user_id: string
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
      parent_links: {
        Row: {
          account_id: string
          active: boolean
          created_at: string
          id: string
          linked_at: string | null
          notify_freq: string
          telegram_id: number | null
          token: string
        }
        Insert: {
          account_id: string
          active?: boolean
          created_at?: string
          id?: string
          linked_at?: string | null
          notify_freq?: string
          telegram_id?: number | null
          token: string
        }
        Update: {
          account_id?: string
          active?: boolean
          created_at?: string
          id?: string
          linked_at?: string | null
          notify_freq?: string
          telegram_id?: number | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "app_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          avatar_code: string | null
          best_streak: number
          coins: number
          created_at: string
          daily_word_count: number
          difficulty: string
          email: string | null
          gender: string | null
          ielts_target_band: number | null
          ielts_variant: string
          last_freeze_used: string | null
          last_streak_reward: number
          last_view: string | null
          last_visit: string | null
          league: string
          level_chosen: string | null
          linny_intro_seen: boolean
          name: string | null
          onboarded: boolean
          placement_count: number | null
          placement_score: number | null
          placement_stars: number | null
          streak: number
          streak_freezes: number
          telegram_id: number | null
          telegram_linked_at: string | null
          telegram_username: string | null
          tg_daily_hour: number
          tg_reminders: boolean
          theme: string
          theme_code: string | null
          total_xp: number
          updated_at: string
          user_id: string
          vocab_bank_ready: boolean
          vocab_last_generated: string | null
          vocab_last_test_date: string | null
          vocab_setup_done: boolean
          vocab_source: string | null
          weekly_xp: number
        }
        Insert: {
          age?: number | null
          avatar_code?: string | null
          best_streak?: number
          coins?: number
          created_at?: string
          daily_word_count?: number
          difficulty?: string
          email?: string | null
          gender?: string | null
          ielts_target_band?: number | null
          ielts_variant?: string
          last_freeze_used?: string | null
          last_streak_reward?: number
          last_view?: string | null
          last_visit?: string | null
          league?: string
          level_chosen?: string | null
          linny_intro_seen?: boolean
          name?: string | null
          onboarded?: boolean
          placement_count?: number | null
          placement_score?: number | null
          placement_stars?: number | null
          streak?: number
          streak_freezes?: number
          telegram_id?: number | null
          telegram_linked_at?: string | null
          telegram_username?: string | null
          tg_daily_hour?: number
          tg_reminders?: boolean
          theme?: string
          theme_code?: string | null
          total_xp?: number
          updated_at?: string
          user_id: string
          vocab_bank_ready?: boolean
          vocab_last_generated?: string | null
          vocab_last_test_date?: string | null
          vocab_setup_done?: boolean
          vocab_source?: string | null
          weekly_xp?: number
        }
        Update: {
          age?: number | null
          avatar_code?: string | null
          best_streak?: number
          coins?: number
          created_at?: string
          daily_word_count?: number
          difficulty?: string
          email?: string | null
          gender?: string | null
          ielts_target_band?: number | null
          ielts_variant?: string
          last_freeze_used?: string | null
          last_streak_reward?: number
          last_view?: string | null
          last_visit?: string | null
          league?: string
          level_chosen?: string | null
          linny_intro_seen?: boolean
          name?: string | null
          onboarded?: boolean
          placement_count?: number | null
          placement_score?: number | null
          placement_stars?: number | null
          streak?: number
          streak_freezes?: number
          telegram_id?: number | null
          telegram_linked_at?: string | null
          telegram_username?: string | null
          tg_daily_hour?: number
          tg_reminders?: boolean
          theme?: string
          theme_code?: string | null
          total_xp?: number
          updated_at?: string
          user_id?: string
          vocab_bank_ready?: boolean
          vocab_last_generated?: string | null
          vocab_last_test_date?: string | null
          vocab_setup_done?: boolean
          vocab_source?: string | null
          weekly_xp?: number
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
      shop_items: {
        Row: {
          active: boolean
          code: string
          description: string | null
          emoji: string | null
          kind: string
          payload: string | null
          price: number
          sort: number
          title: string
        }
        Insert: {
          active?: boolean
          code: string
          description?: string | null
          emoji?: string | null
          kind: string
          payload?: string | null
          price: number
          sort?: number
          title: string
        }
        Update: {
          active?: boolean
          code?: string
          description?: string | null
          emoji?: string | null
          kind?: string
          payload?: string | null
          price?: number
          sort?: number
          title?: string
        }
        Relationships: []
      }
      story_scenarios: {
        Row: {
          active: boolean
          code: string
          description: string | null
          emoji: string | null
          id: string
          level: string
          seed_prompt: string
          sort: number
          title: string
        }
        Insert: {
          active?: boolean
          code: string
          description?: string | null
          emoji?: string | null
          id?: string
          level?: string
          seed_prompt: string
          sort?: number
          title: string
        }
        Update: {
          active?: boolean
          code?: string
          description?: string | null
          emoji?: string | null
          id?: string
          level?: string
          seed_prompt?: string
          sort?: number
          title?: string
        }
        Relationships: []
      }
      story_sessions: {
        Row: {
          created_at: string
          id: string
          scenario_code: string
          status: string
          turns: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          scenario_code: string
          status?: string
          turns?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          scenario_code?: string
          status?: string
          turns?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_sessions_scenario_code_fkey"
            columns: ["scenario_code"]
            isOneToOne: false
            referencedRelation: "story_scenarios"
            referencedColumns: ["code"]
          },
        ]
      }
      story_turns: {
        Row: {
          choices: Json
          created_at: string
          grammar_note: string | null
          id: string
          role: string
          session_id: string
          text: string
          translation: string | null
          user_id: string
        }
        Insert: {
          choices?: Json
          created_at?: string
          grammar_note?: string | null
          id?: string
          role: string
          session_id: string
          text: string
          translation?: string | null
          user_id?: string
        }
        Update: {
          choices?: Json
          created_at?: string
          grammar_note?: string | null
          id?: string
          role?: string
          session_id?: string
          text?: string
          translation?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "story_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          ai_feedback: Json | null
          ai_score: number | null
          content: string
          created_at: string
          group_id: string | null
          id: string
          kind: string
          prompt: string | null
          student_id: string
        }
        Insert: {
          ai_feedback?: Json | null
          ai_score?: number | null
          content: string
          created_at?: string
          group_id?: string | null
          id?: string
          kind: string
          prompt?: string | null
          student_id?: string
        }
        Update: {
          ai_feedback?: Json | null
          ai_score?: number | null
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: string
          prompt?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_group_id_fkey"
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
      tg_login_codes: {
        Row: {
          account_id: string
          code: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
        }
        Insert: {
          account_id: string
          code: string
          created_at?: string
          expires_at: string
          id?: string
          used_at?: string | null
        }
        Update: {
          account_id?: string
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tg_login_codes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "app_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_purchases: {
        Row: {
          created_at: string
          id: string
          item_code: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_code: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_purchases_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["code"]
          },
        ]
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
          user_id: string
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
      award_progress: {
        Args: { _coins: number; _reason: string; _xp: number }
        Returns: {
          coins: number
          league: string
          total_xp: number
          weekly_xp: number
        }[]
      }
      buy_shop_item: { Args: { _code: string }; Returns: Json }
      consume_ai_quota: {
        Args: { _kind: string; _limit: number }
        Returns: Json
      }
      create_group: {
        Args: { _lesson_days?: number[]; _name: string }
        Returns: {
          id: string
          join_code: string
          name: string
        }[]
      }
      duel_attach_bot: { Args: { _match: string }; Returns: boolean }
      duel_bot_score: {
        Args: { _finished: boolean; _match: string; _score: number }
        Returns: undefined
      }
      duel_find_match: {
        Args: { _name: string; _questions: Json }
        Returns: string
      }
      duel_report: {
        Args: { _finished: boolean; _match: string; _score: number }
        Returns: Json
      }
      equip_shop_item: { Args: { _code: string }; Returns: Json }
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
      league_board: {
        Args: never
        Returns: {
          avatar: string
          is_me: boolean
          name: string
          user_id: string
          weekly_xp: number
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
      run_league_rollover: { Args: never; Returns: undefined }
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
      touch_daily_progress: { Args: never; Returns: Json }
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
