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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accidents: {
        Row: {
          actions_taken: string | null
          created_at: string
          description: string
          hospital_transfer: boolean
          id: string
          location: string | null
          occurred_at: string
          parents_notified: boolean
          recorded_by: string | null
          school_id: string
          severity: string
          student_id: string | null
          updated_at: string
          witnesses: string | null
        }
        Insert: {
          actions_taken?: string | null
          created_at?: string
          description: string
          hospital_transfer?: boolean
          id?: string
          location?: string | null
          occurred_at?: string
          parents_notified?: boolean
          recorded_by?: string | null
          school_id: string
          severity?: string
          student_id?: string | null
          updated_at?: string
          witnesses?: string | null
        }
        Update: {
          actions_taken?: string | null
          created_at?: string
          description?: string
          hospital_transfer?: boolean
          id?: string
          location?: string | null
          occurred_at?: string
          parents_notified?: boolean
          recorded_by?: string | null
          school_id?: string
          severity?: string
          student_id?: string | null
          updated_at?: string
          witnesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accidents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action: string
          actor_name: string | null
          actor_role: string | null
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json
          school_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          school_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          school_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          author_id: string | null
          content: string
          created_at: string
          id: string
          school_id: string
          title: string
        }
        Insert: {
          audience?: string
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          school_id?: string
          title: string
        }
        Update: {
          audience?: string
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          school_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_schedules: {
        Row: {
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          enabled: boolean
          frequency: string
          hour_of_day: number
          id: string
          last_run_at: string | null
          next_run_at: string | null
          retention_days: number
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          enabled?: boolean
          frequency?: string
          hour_of_day?: number
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          retention_days?: number
          school_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          enabled?: boolean
          frequency?: string
          hour_of_day?: number
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          retention_days?: number
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_schedules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      backups: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          kind: string
          notes: string | null
          row_counts: Json
          school_id: string
          scope: string
          size_bytes: number
          status: string
          storage_path: string | null
          tables: string[]
          total_rows: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          kind?: string
          notes?: string | null
          row_counts?: Json
          school_id?: string
          scope?: string
          size_bytes?: number
          status?: string
          storage_path?: string | null
          tables?: string[]
          total_rows?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          kind?: string
          notes?: string | null
          row_counts?: Json
          school_id?: string
          scope?: string
          size_bytes?: number
          status?: string
          storage_path?: string | null
          tables?: string[]
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "backups_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          class_id: string | null
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          event_type: string
          exam_id: string | null
          id: string
          location: string | null
          school_id: string
          starts_at: string
          title: string
          updated_at: string
          visible_roles: string[]
        }
        Insert: {
          all_day?: boolean
          class_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: string
          exam_id?: string | null
          id?: string
          location?: string | null
          school_id: string
          starts_at: string
          title: string
          updated_at?: string
          visible_roles?: string[]
        }
        Update: {
          all_day?: boolean
          class_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: string
          exam_id?: string | null
          id?: string
          location?: string | null
          school_id?: string
          starts_at?: string
          title?: string
          updated_at?: string
          visible_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      canteen_consumption: {
        Row: {
          amount: number
          consumed: boolean
          created_at: string
          date: string
          id: string
          meal_type: string
          menu_id: string | null
          recorded_by: string | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          consumed?: boolean
          created_at?: string
          date?: string
          id?: string
          meal_type?: string
          menu_id?: string | null
          recorded_by?: string | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          consumed?: boolean
          created_at?: string
          date?: string
          id?: string
          meal_type?: string
          menu_id?: string | null
          recorded_by?: string | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canteen_consumption_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "canteen_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canteen_consumption_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      canteen_menus: {
        Row: {
          created_at: string
          dessert: string | null
          drink: string | null
          id: string
          main_dish: string
          meal_type: string
          menu_date: string
          notes: string | null
          price: number
          school_id: string
          starter: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dessert?: string | null
          drink?: string | null
          id?: string
          main_dish: string
          meal_type?: string
          menu_date: string
          notes?: string | null
          price?: number
          school_id: string
          starter?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dessert?: string | null
          drink?: string | null
          id?: string
          main_dish?: string
          meal_type?: string
          menu_date?: string
          notes?: string | null
          price?: number
          school_id?: string
          starter?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      canteen_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          notes: string | null
          paid_at: string
          period: string | null
          recorded_by: string | null
          reference: string | null
          school_id: string
          student_id: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          period?: string | null
          recorded_by?: string | null
          reference?: string | null
          school_id: string
          student_id: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          period?: string | null
          recorded_by?: string | null
          reference?: string | null
          school_id?: string
          student_id?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canteen_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canteen_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "canteen_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      canteen_subscriptions: {
        Row: {
          amount: number
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          plan: string
          school_id: string
          start_date: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          plan?: string
          school_id: string
          start_date?: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          plan?: string
          school_id?: string
          start_date?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canteen_subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      circular_reads: {
        Row: {
          circular_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          circular_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          circular_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circular_reads_circular_id_fkey"
            columns: ["circular_id"]
            isOneToOne: false
            referencedRelation: "circulars"
            referencedColumns: ["id"]
          },
        ]
      }
      circulars: {
        Row: {
          attachment_url: string | null
          author_id: string | null
          content: string
          created_at: string
          id: string
          published: boolean
          published_at: string
          reference: string | null
          school_id: string
          target_class_id: string | null
          target_roles: string[]
          title: string
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string
          reference?: string | null
          school_id: string
          target_class_id?: string | null
          target_roles?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string
          reference?: string | null
          school_id?: string
          target_class_id?: string | null
          target_roles?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circulars_target_class_id_fkey"
            columns: ["target_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          annual_fee: number
          created_at: string
          id: string
          import_id: string | null
          level: string
          name: string
          school_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          annual_fee?: number
          created_at?: string
          id?: string
          import_id?: string | null
          level: string
          name: string
          school_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          annual_fee?: number
          created_at?: string
          id?: string
          import_id?: string | null
          level?: string
          name?: string
          school_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "data_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cotisation_payment_audit: {
        Row: {
          action: string
          actor_id: string | null
          amount: number
          created_at: string
          id: string
          metadata: Json
          payment_id: string
          reference: string | null
          school_id: string
          student_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json
          payment_id: string
          reference?: string | null
          school_id: string
          student_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json
          payment_id?: string
          reference?: string | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotisation_payment_audit_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "student_plan_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotisation_payment_audit_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotisation_payment_audit_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      data_imports: {
        Row: {
          created_at: string
          created_by: string | null
          created_count: number
          error_count: number
          errors: Json
          filename: string | null
          id: string
          kind: string
          mode: string
          rolled_back_at: string | null
          school_id: string
          skipped_count: number
          status: string
          total_rows: number
          updated_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_count?: number
          error_count?: number
          errors?: Json
          filename?: string | null
          id?: string
          kind: string
          mode?: string
          rolled_back_at?: string | null
          school_id?: string
          skipped_count?: number
          status?: string
          total_rows?: number
          updated_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_count?: number
          error_count?: number
          errors?: Json
          filename?: string | null
          id?: string
          kind?: string
          mode?: string
          rolled_back_at?: string | null
          school_id?: string
          skipped_count?: number
          status?: string
          total_rows?: number
          updated_count?: number
        }
        Relationships: []
      }
      discipline_incidents: {
        Row: {
          created_at: string | null
          description: string | null
          follow_up_notes: string | null
          follow_up_required: boolean | null
          id: string
          incident_date: string
          incident_type: string
          recorded_by: string | null
          reported_by_user_id: string | null
          sanction: string | null
          school_id: string
          student_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean | null
          id?: string
          incident_date?: string
          incident_type: string
          recorded_by?: string | null
          reported_by_user_id?: string | null
          sanction?: string | null
          school_id: string
          student_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean | null
          id?: string
          incident_date?: string
          incident_type?: string
          recorded_by?: string | null
          reported_by_user_id?: string | null
          sanction?: string | null
          school_id?: string
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discipline_incidents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_incidents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_contracts: {
        Row: {
          base_salary: number
          created_at: string
          end_date: string | null
          full_name: string
          id: string
          notes: string | null
          position: string
          school_id: string
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          base_salary?: number
          created_at?: string
          end_date?: string | null
          full_name: string
          id?: string
          notes?: string | null
          position: string
          school_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          base_salary?: number
          created_at?: string
          end_date?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          position?: string
          school_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_contracts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contracts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leaves: {
        Row: {
          contract_id: string
          created_at: string
          end_date: string
          id: string
          reason: string | null
          school_id: string
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          type: Database["public"]["Enums"]["leave_type"]
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          end_date: string
          id?: string
          reason?: string | null
          school_id?: string
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          type: Database["public"]["Enums"]["leave_type"]
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          end_date?: string
          id?: string
          reason?: string | null
          school_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          type?: Database["public"]["Enums"]["leave_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_leaves_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "employee_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leaves_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          class_id: string
          coefficient: number
          created_at: string
          duration_minutes: number
          exam_date: string
          id: string
          notes: string | null
          room_id: string | null
          school_id: string
          start_time: string | null
          subject_id: string
          supervisor_id: string | null
          title: string
          type: Database["public"]["Enums"]["exam_type"]
          updated_at: string
        }
        Insert: {
          class_id: string
          coefficient?: number
          created_at?: string
          duration_minutes?: number
          exam_date: string
          id?: string
          notes?: string | null
          room_id?: string | null
          school_id?: string
          start_time?: string | null
          subject_id: string
          supervisor_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["exam_type"]
          updated_at?: string
        }
        Update: {
          class_id?: string
          coefficient?: number
          created_at?: string
          duration_minutes?: number
          exam_date?: string
          id?: string
          notes?: string | null
          room_id?: string | null
          school_id?: string
          start_time?: string | null
          subject_id?: string
          supervisor_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["exam_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          account_id: string
          amount: number
          beneficiary: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          occurred_at: string
          reference: string | null
          school_id: string
          type: Database["public"]["Enums"]["expense_type"]
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          beneficiary?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          occurred_at?: string
          reference?: string | null
          school_id?: string
          type: Database["public"]["Enums"]["expense_type"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          beneficiary?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          occurred_at?: string
          reference?: string | null
          school_id?: string
          type?: Database["public"]["Enums"]["expense_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          created_at: string
          currency: string
          id: string
          initial_balance: number
          name: string
          notes: string | null
          school_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          initial_balance?: number
          name: string
          notes?: string | null
          school_id?: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          initial_balance?: number
          name?: string
          notes?: string | null
          school_id?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          academic_year: string
          coefficient: number | null
          created_at: string
          evaluation_type: string | null
          id: string
          import_id: string | null
          max_score: number
          period: string
          recorded_by: string | null
          school_id: string
          score: number
          student_id: string
          subject_id: string
        }
        Insert: {
          academic_year?: string
          coefficient?: number | null
          created_at?: string
          evaluation_type?: string | null
          id?: string
          import_id?: string | null
          max_score?: number
          period: string
          recorded_by?: string | null
          school_id?: string
          score: number
          student_id: string
          subject_id: string
        }
        Update: {
          academic_year?: string
          coefficient?: number | null
          created_at?: string
          evaluation_type?: string | null
          id?: string
          import_id?: string | null
          max_score?: number
          period?: string
          recorded_by?: string | null
          school_id?: string
          score?: number
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "data_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      library_books: {
        Row: {
          author: string | null
          available_copies: number
          category_id: string | null
          created_at: string
          id: string
          isbn: string | null
          notes: string | null
          school_id: string
          title: string
          total_copies: number
          updated_at: string
        }
        Insert: {
          author?: string | null
          available_copies?: number
          category_id?: string | null
          created_at?: string
          id?: string
          isbn?: string | null
          notes?: string | null
          school_id?: string
          title: string
          total_copies?: number
          updated_at?: string
        }
        Update: {
          author?: string | null
          available_copies?: number
          category_id?: string | null
          created_at?: string
          id?: string
          isbn?: string | null
          notes?: string | null
          school_id?: string
          title?: string
          total_copies?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_books_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "library_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_books_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      library_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          school_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          school_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_categories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      library_loans: {
        Row: {
          book_id: string
          borrower_name: string
          created_at: string
          due_date: string
          id: string
          loan_date: string
          notes: string | null
          penalty: number
          return_date: string | null
          school_id: string
          student_id: string | null
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          borrower_name: string
          created_at?: string
          due_date: string
          id?: string
          loan_date?: string
          notes?: string | null
          penalty?: number
          return_date?: string | null
          school_id?: string
          student_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          book_id?: string
          borrower_name?: string
          created_at?: string
          due_date?: string
          id?: string
          loan_date?: string
          notes?: string | null
          penalty?: number
          return_date?: string | null
          school_id?: string
          student_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_loans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_loans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_loans_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_records: {
        Row: {
          allergies: string | null
          blood_type: string | null
          chronic_conditions: string | null
          created_at: string
          doctor_name: string | null
          doctor_phone: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          medications: string | null
          notes: string | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          blood_type?: string | null
          chronic_conditions?: string | null
          created_at?: string
          doctor_name?: string | null
          doctor_phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          medications?: string | null
          notes?: string | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          blood_type?: string | null
          chronic_conditions?: string | null
          created_at?: string
          doctor_name?: string | null
          doctor_phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          medications?: string | null
          notes?: string | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_visits: {
        Row: {
          created_at: string
          diagnosis: string | null
          id: string
          notes: string | null
          outcome: string
          reason: string
          recorded_by: string | null
          school_id: string
          student_id: string
          symptoms: string | null
          temperature: number | null
          updated_at: string
          visit_date: string
        }
        Insert: {
          created_at?: string
          diagnosis?: string | null
          id?: string
          notes?: string | null
          outcome?: string
          reason: string
          recorded_by?: string | null
          school_id: string
          student_id: string
          symptoms?: string | null
          temperature?: number | null
          updated_at?: string
          visit_date?: string
        }
        Update: {
          created_at?: string
          diagnosis?: string | null
          id?: string
          notes?: string | null
          outcome?: string
          reason?: string
          recorded_by?: string | null
          school_id?: string
          student_id?: string
          symptoms?: string | null
          temperature?: number | null
          updated_at?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_visits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      medicines: {
        Row: {
          alert_threshold: number
          created_at: string
          expiry_date: string | null
          form: string | null
          id: string
          name: string
          notes: string | null
          quantity: number
          school_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          alert_threshold?: number
          created_at?: string
          expiry_date?: string | null
          form?: string | null
          id?: string
          name: string
          notes?: string | null
          quantity?: number
          school_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          alert_threshold?: number
          created_at?: string
          expiry_date?: string | null
          form?: string | null
          id?: string
          name?: string
          notes?: string | null
          quantity?: number
          school_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_broadcasts: {
        Row: {
          author_id: string
          body: string
          channel: string
          created_at: string
          id: string
          school_id: string
          subject: string
          target_class_id: string | null
          target_role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          author_id: string
          body: string
          channel?: string
          created_at?: string
          id?: string
          school_id?: string
          subject: string
          target_class_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          author_id?: string
          body?: string
          channel?: string
          created_at?: string
          id?: string
          school_id?: string
          subject?: string
          target_class_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "message_broadcasts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_broadcasts_target_class_id_fkey"
            columns: ["target_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          school_id: string
          sender_id: string
          subject: string
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          school_id?: string
          sender_id: string
          subject: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          school_id?: string
          sender_id?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          metadata: Json
          read_at: string | null
          school_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          school_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          school_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nursery_children: {
        Row: {
          allergies: string | null
          created_at: string
          id: string
          medical_notes: string | null
          nap_needed: boolean
          pickup_person: string | null
          pickup_phone: string | null
          school_id: string
          section_id: string | null
          special_notes: string | null
          student_id: string
          toilet_trained: boolean
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          created_at?: string
          id?: string
          medical_notes?: string | null
          nap_needed?: boolean
          pickup_person?: string | null
          pickup_phone?: string | null
          school_id: string
          section_id?: string | null
          special_notes?: string | null
          student_id: string
          toilet_trained?: boolean
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          created_at?: string
          id?: string
          medical_notes?: string | null
          nap_needed?: boolean
          pickup_person?: string | null
          pickup_phone?: string | null
          school_id?: string
          section_id?: string | null
          special_notes?: string | null
          student_id?: string
          toilet_trained?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_children_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "nursery_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_children_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_competencies: {
        Row: {
          created_at: string
          display_order: number
          domain: string
          id: string
          label: string
          school_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          domain: string
          id?: string
          label: string
          school_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          domain?: string
          id?: string
          label?: string
          school_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_competencies_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_daily_logs: {
        Row: {
          activities: string | null
          attendance: string | null
          created_at: string
          created_by: string | null
          date: string
          hygiene: string | null
          id: string
          incidents: string | null
          meal: string | null
          mood: string | null
          nap: string | null
          parent_comment: string | null
          school_id: string
          section_id: string | null
          student_id: string
          toilet: string | null
          updated_at: string
        }
        Insert: {
          activities?: string | null
          attendance?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          hygiene?: string | null
          id?: string
          incidents?: string | null
          meal?: string | null
          mood?: string | null
          nap?: string | null
          parent_comment?: string | null
          school_id: string
          section_id?: string | null
          student_id: string
          toilet?: string | null
          updated_at?: string
        }
        Update: {
          activities?: string | null
          attendance?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          hygiene?: string | null
          id?: string
          incidents?: string | null
          meal?: string | null
          mood?: string | null
          nap?: string | null
          parent_comment?: string | null
          school_id?: string
          section_id?: string | null
          student_id?: string
          toilet?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_daily_logs_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "nursery_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_daily_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_evaluations: {
        Row: {
          comment: string | null
          competency_id: string
          created_at: string
          evaluated_by: string | null
          id: string
          level: string
          period: string
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          competency_id: string
          created_at?: string
          evaluated_by?: string | null
          id?: string
          level?: string
          period?: string
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          competency_id?: string
          created_at?: string
          evaluated_by?: string | null
          id?: string
          level?: string
          period?: string
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_evaluations_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "nursery_competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_evaluations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_schedule_slots: {
        Row: {
          activity: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          label: string | null
          notes: string | null
          school_id: string
          section_id: string | null
          start_time: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          activity?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          label?: string | null
          notes?: string | null
          school_id: string
          section_id?: string | null
          start_time?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          activity?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          label?: string | null
          notes?: string | null
          school_id?: string
          section_id?: string | null
          start_time?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_schedule_slots_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "nursery_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_schedule_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_sections: {
        Row: {
          age_range: string | null
          capacity: number | null
          class_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          school_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          age_range?: string | null
          capacity?: number | null
          class_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          school_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          age_range?: string | null
          capacity?: number | null
          class_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          school_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_sections_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_sections_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          paid_at: string
          payment_method: string | null
          payment_type: string
          period: string | null
          proof_url: string | null
          receipt_number: string | null
          recorded_by: string | null
          rejection_reason: string | null
          school_id: string
          status: string
          student_id: string
          transaction_reference: string | null
          validated_at: string | null
          validated_by: string | null
          validation_status: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: string | null
          payment_type: string
          period?: string | null
          proof_url?: string | null
          receipt_number?: string | null
          recorded_by?: string | null
          rejection_reason?: string | null
          school_id?: string
          status?: string
          student_id: string
          transaction_reference?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: string | null
          payment_type?: string
          period?: string | null
          proof_url?: string | null
          receipt_number?: string | null
          recorded_by?: string | null
          rejection_reason?: string | null
          school_id?: string
          status?: string
          student_id?: string
          transaction_reference?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          advances: number
          base_salary: number
          bonuses: number
          contract_id: string
          created_at: string
          deductions: number
          id: string
          net_pay: number
          notes: string | null
          overtime_amount: number
          overtime_hours: number
          paid: boolean
          paid_at: string | null
          period_month: number
          period_year: number
          school_id: string
          updated_at: string
        }
        Insert: {
          advances?: number
          base_salary?: number
          bonuses?: number
          contract_id: string
          created_at?: string
          deductions?: number
          id?: string
          net_pay?: number
          notes?: string | null
          overtime_amount?: number
          overtime_hours?: number
          paid?: boolean
          paid_at?: string | null
          period_month: number
          period_year: number
          school_id?: string
          updated_at?: string
        }
        Update: {
          advances?: number
          base_salary?: number
          bonuses?: number
          contract_id?: string
          created_at?: string
          deductions?: number
          id?: string
          net_pay?: number
          notes?: string | null
          overtime_amount?: number
          overtime_hours?: number
          paid?: boolean
          paid_at?: string | null
          period_month?: number
          period_year?: number
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslips_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "employee_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          disabled_at: string | null
          full_name: string
          id: string
          phone: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          disabled_at?: string | null
          full_name: string
          id: string
          phone?: string | null
          school_id?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          disabled_at?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_counters: {
        Row: {
          last_seq: number
          school_id: string
          year: number
        }
        Insert: {
          last_seq?: number
          school_id: string
          year: number
        }
        Update: {
          last_seq?: number
          school_id?: string
          year?: number
        }
        Relationships: []
      }
      revenues: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          occurred_at: string
          reference: string | null
          school_id: string
          student_id: string | null
          type: Database["public"]["Enums"]["revenue_type"]
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          occurred_at?: string
          reference?: string | null
          school_id?: string
          student_id?: string | null
          type: Database["public"]["Enums"]["revenue_type"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          occurred_at?: string
          reference?: string | null
          school_id?: string
          student_id?: string | null
          type?: Database["public"]["Enums"]["revenue_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenues_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenues_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenues_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          building: string | null
          capacity: number
          created_at: string
          id: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          building?: string | null
          capacity?: number
          created_at?: string
          id?: string
          name: string
          school_id?: string
          updated_at?: string
        }
        Update: {
          building?: string | null
          capacity?: number
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_slots: {
        Row: {
          class_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          room_id: string | null
          school_id: string
          start_time: string
          subject_id: string | null
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          room_id?: string | null
          school_id?: string
          start_time: string
          subject_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          room_id?: string | null
          school_id?: string
          start_time?: string
          subject_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_events: {
        Row: {
          contact: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          event_type: string
          id: string
          image_url: string | null
          location: string | null
          published: boolean
          school_id: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          image_url?: string | null
          location?: string | null
          published?: boolean
          school_id: string
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          image_url?: string | null
          location?: string | null
          published?: boolean
          school_id?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          academic_year: string | null
          address: string | null
          bulletin_settings: Json
          city: string | null
          code: string | null
          created_at: string
          currency: string
          director_name: string | null
          director_signature_url: string | null
          email: string | null
          id: string
          last_activity_at: string | null
          logo_url: string | null
          name: string
          period_system: string
          phone: string | null
          receipt_accent_color: string | null
          receipt_footer_note: string | null
          receipt_header: string | null
          receipt_legal_notice: string | null
          receipt_prefix: string | null
          receipt_settings: Json
          receipt_title: string | null
          school_stamp_url: string | null
          status: string
          theme_primary: string | null
          theme_secondary: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          academic_year?: string | null
          address?: string | null
          bulletin_settings?: Json
          city?: string | null
          code?: string | null
          created_at?: string
          currency?: string
          director_name?: string | null
          director_signature_url?: string | null
          email?: string | null
          id?: string
          last_activity_at?: string | null
          logo_url?: string | null
          name: string
          period_system?: string
          phone?: string | null
          receipt_accent_color?: string | null
          receipt_footer_note?: string | null
          receipt_header?: string | null
          receipt_legal_notice?: string | null
          receipt_prefix?: string | null
          receipt_settings?: Json
          receipt_title?: string | null
          school_stamp_url?: string | null
          status?: string
          theme_primary?: string | null
          theme_secondary?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          academic_year?: string | null
          address?: string | null
          bulletin_settings?: Json
          city?: string | null
          code?: string | null
          created_at?: string
          currency?: string
          director_name?: string | null
          director_signature_url?: string | null
          email?: string | null
          id?: string
          last_activity_at?: string | null
          logo_url?: string | null
          name?: string
          period_system?: string
          phone?: string | null
          receipt_accent_color?: string | null
          receipt_footer_note?: string | null
          receipt_header?: string | null
          receipt_legal_notice?: string | null
          receipt_prefix?: string | null
          receipt_settings?: Json
          receipt_title?: string | null
          school_stamp_url?: string | null
          status?: string
          theme_primary?: string | null
          theme_secondary?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      student_access_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          school_id: string
          student_id: string
          used_as_role: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          school_id?: string
          student_id: string
          used_as_role?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          school_id?: string
          student_id?: string
          used_as_role?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_access_codes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_access_codes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_attendance: {
        Row: {
          class_id: string | null
          created_at: string
          date: string
          id: string
          justification: string | null
          justified: boolean
          minutes_late: number | null
          recorded_by: string | null
          school_id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          justification?: string | null
          justified?: boolean
          minutes_late?: number | null
          recorded_by?: string | null
          school_id?: string
          status: string
          student_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          justification?: string | null
          justified?: boolean
          minutes_late?: number | null
          recorded_by?: string | null
          school_id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_parents: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          parent_user_id: string
          relation: string
          school_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          parent_user_id: string
          relation?: string
          school_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          parent_user_id?: string
          relation?: string
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_parents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_parents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_plan_payments: {
        Row: {
          academic_year: string
          amount: number
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          declared_at: string | null
          declared_total_amount: number | null
          id: string
          notes: string | null
          paid_at: string
          paid_by: string | null
          payer_phone: string | null
          payment_group_id: string | null
          payment_method: string | null
          payment_mode: string
          receipt_number: string | null
          reference: string | null
          rejection_reason: string | null
          school_id: string
          school_share: number
          status: string
          student_id: string
          transfer_amount: number | null
          transfer_date: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          academic_year: string
          amount?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          declared_at?: string | null
          declared_total_amount?: number | null
          id?: string
          notes?: string | null
          paid_at?: string
          paid_by?: string | null
          payer_phone?: string | null
          payment_group_id?: string | null
          payment_method?: string | null
          payment_mode?: string
          receipt_number?: string | null
          reference?: string | null
          rejection_reason?: string | null
          school_id: string
          school_share?: number
          status?: string
          student_id: string
          transfer_amount?: number | null
          transfer_date?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          academic_year?: string
          amount?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          declared_at?: string | null
          declared_total_amount?: number | null
          id?: string
          notes?: string | null
          paid_at?: string
          paid_by?: string | null
          payer_phone?: string | null
          payment_group_id?: string | null
          payment_method?: string | null
          payment_mode?: string
          receipt_number?: string | null
          reference?: string | null
          rejection_reason?: string | null
          school_id?: string
          school_share?: number
          status?: string
          student_id?: string
          transfer_amount?: number | null
          transfer_date?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_plan_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_plan_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          birth_date: string | null
          birth_place: string | null
          class_id: string | null
          created_at: string
          enrollment_date: string | null
          full_name: string
          gender: string | null
          id: string
          import_id: string | null
          matricule: string
          parent_name: string | null
          parent_phone: string | null
          parent_user_id: string | null
          photo_url: string | null
          school_id: string
          status: string
          student_user_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          class_id?: string | null
          created_at?: string
          enrollment_date?: string | null
          full_name: string
          gender?: string | null
          id?: string
          import_id?: string | null
          matricule: string
          parent_name?: string | null
          parent_phone?: string | null
          parent_user_id?: string | null
          photo_url?: string | null
          school_id?: string
          status?: string
          student_user_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          class_id?: string | null
          created_at?: string
          enrollment_date?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          import_id?: string | null
          matricule?: string
          parent_name?: string | null
          parent_phone?: string | null
          parent_user_id?: string | null
          photo_url?: string | null
          school_id?: string
          status?: string
          student_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "data_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          coefficient: number
          created_at: string
          id: string
          import_id: string | null
          name: string
          school_id: string
        }
        Insert: {
          coefficient?: number
          created_at?: string
          id?: string
          import_id?: string | null
          name: string
          school_id?: string
        }
        Update: {
          coefficient?: number
          created_at?: string
          id?: string
          import_id?: string | null
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "data_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teacher_attendance: {
        Row: {
          created_at: string
          date: string
          id: string
          justification: string | null
          justified: boolean
          minutes_late: number | null
          recorded_by: string | null
          school_id: string
          status: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          justification?: string | null
          justified?: boolean
          minutes_late?: number | null
          recorded_by?: string | null
          school_id?: string
          status: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          justification?: string | null
          justified?: boolean
          minutes_late?: number | null
          recorded_by?: string | null
          school_id?: string
          status?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_attendance_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_class_assignments: {
        Row: {
          academic_year: string
          class_id: string
          created_at: string
          id: string
          import_id: string | null
          school_id: string
          subject_id: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          academic_year?: string
          class_id: string
          created_at?: string
          id?: string
          import_id?: string | null
          school_id?: string
          subject_id?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          class_id?: string
          created_at?: string
          id?: string
          import_id?: string | null
          school_id?: string
          subject_id?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_class_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "data_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          hire_date: string | null
          id: string
          import_id: string | null
          matricule: string
          monthly_salary: number | null
          phone: string | null
          school_id: string
          subjects: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          import_id?: string | null
          matricule: string
          monthly_salary?: number | null
          phone?: string | null
          school_id?: string
          subjects?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          import_id?: string | null
          matricule?: string
          monthly_salary?: number | null
          phone?: string | null
          school_id?: string
          subjects?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "data_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_attendance: {
        Row: {
          created_at: string
          date: string
          direction: string
          id: string
          notes: string | null
          recorded_by: string | null
          route_id: string | null
          school_id: string
          status: string
          student_id: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          direction?: string
          id?: string
          notes?: string | null
          recorded_by?: string | null
          route_id?: string | null
          school_id: string
          status?: string
          student_id: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          direction?: string
          id?: string
          notes?: string | null
          recorded_by?: string | null
          route_id?: string | null
          school_id?: string
          status?: string
          student_id?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_attendance_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_attendance_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "transport_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_buses: {
        Row: {
          capacity: number
          created_at: string
          driver_id: string | null
          id: string
          model: string | null
          name: string
          notes: string | null
          plate_number: string
          school_id: string
          status: string
          updated_at: string
          year: number | null
        }
        Insert: {
          capacity?: number
          created_at?: string
          driver_id?: string | null
          id?: string
          model?: string | null
          name: string
          notes?: string | null
          plate_number: string
          school_id: string
          status?: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          capacity?: number
          created_at?: string
          driver_id?: string | null
          id?: string
          model?: string | null
          name?: string
          notes?: string | null
          plate_number?: string
          school_id?: string
          status?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_buses_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "transport_drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_drivers: {
        Row: {
          created_at: string
          full_name: string
          hire_date: string | null
          id: string
          license_expiry: string | null
          license_number: string | null
          notes: string | null
          phone: string | null
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          hire_date?: string | null
          id?: string
          license_expiry?: string | null
          license_number?: string | null
          notes?: string | null
          phone?: string | null
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          hire_date?: string | null
          id?: string
          license_expiry?: string | null
          license_number?: string | null
          notes?: string | null
          phone?: string | null
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      transport_routes: {
        Row: {
          bus_id: string | null
          created_at: string
          departure_time: string | null
          description: string | null
          driver_id: string | null
          id: string
          monthly_fee: number
          name: string
          return_time: string | null
          school_id: string
          status: string
          stops: Json
          updated_at: string
        }
        Insert: {
          bus_id?: string | null
          created_at?: string
          departure_time?: string | null
          description?: string | null
          driver_id?: string | null
          id?: string
          monthly_fee?: number
          name: string
          return_time?: string | null
          school_id: string
          status?: string
          stops?: Json
          updated_at?: string
        }
        Update: {
          bus_id?: string | null
          created_at?: string
          departure_time?: string | null
          description?: string | null
          driver_id?: string | null
          id?: string
          monthly_fee?: number
          name?: string
          return_time?: string | null
          school_id?: string
          status?: string
          stops?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_routes_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "transport_buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_routes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "transport_drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_subscriptions: {
        Row: {
          created_at: string
          direction: string
          end_date: string | null
          id: string
          monthly_fee: number
          notes: string | null
          route_id: string
          school_id: string
          start_date: string
          status: string
          stop_name: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          direction?: string
          end_date?: string | null
          id?: string
          monthly_fee?: number
          notes?: string | null
          route_id: string
          school_id: string
          start_date?: string
          status?: string
          stop_name?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          direction?: string
          end_date?: string | null
          id?: string
          monthly_fee?: number
          notes?: string | null
          route_id?: string
          school_id?: string
          start_date?: string
          status?: string
          stop_name?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_subscriptions_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          created_at: string
          dosage: string | null
          end_date: string | null
          frequency: string | null
          id: string
          medicine_id: string | null
          medicine_name: string
          notes: string | null
          school_id: string
          start_date: string
          status: string
          student_id: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          medicine_id?: string | null
          medicine_name: string
          notes?: string | null
          school_id: string
          start_date?: string
          status?: string
          student_id: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          medicine_id?: string | null
          medicine_name?: string
          notes?: string | null
          school_id?: string
          start_date?: string
          status?: string
          student_id?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatments_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "medical_visits"
            referencedColumns: ["id"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_teachers: { Args: { _user_id: string }; Returns: boolean }
      current_academic_year: { Args: { _at?: string }; Returns: string }
      current_academic_year_default: { Args: never; Returns: string }
      current_school_id: { Args: never; Returns: string }
      declare_cotisation_group_payment: {
        Args: {
          _payer_phone: string
          _reference: string
          _student_ids: string[]
          _transfer_date: string
        }
        Returns: string
      }
      declare_cotisation_payment: {
        Args: {
          _payer_phone: string
          _reference: string
          _student_id: string
          _transfer_date: string
        }
        Returns: {
          academic_year: string
          amount: number
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          declared_at: string | null
          declared_total_amount: number | null
          id: string
          notes: string | null
          paid_at: string
          paid_by: string | null
          payer_phone: string | null
          payment_group_id: string | null
          payment_method: string | null
          payment_mode: string
          receipt_number: string | null
          reference: string | null
          rejection_reason: string | null
          school_id: string
          school_share: number
          status: string
          student_id: string
          transfer_amount: number | null
          transfer_date: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "student_plan_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_overdue_subscriptions: { Args: never; Returns: undefined }
      get_class_timetable: { Args: { _class_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_grades_batch: {
        Args: { _import_id: string; _mode: string; _rows: Json }
        Returns: Json
      }
      is_direction: { Args: { _user_id: string }; Returns: boolean }
      is_finance: { Args: { _user_id: string }; Returns: boolean }
      is_hr: { Args: { _user_id: string }; Returns: boolean }
      is_parent_of_student: {
        Args: { _student_id: string; _uid: string }
        Returns: boolean
      }
      is_school_subscription_active: {
        Args: { _school_id: string }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _uid: string }; Returns: boolean }
      next_receipt_number: { Args: { _school_id: string }; Returns: string }
      review_cotisation_payment: {
        Args: { _approve: boolean; _payment_id: string; _reason?: string }
        Returns: number
      }
      same_school: { Args: { _school_id: string }; Returns: boolean }
      school_academic_year: { Args: { _school_id: string }; Returns: string }
      school_access_mode: { Args: { _school_id: string }; Returns: string }
      school_access_summary: { Args: { _school_id: string }; Returns: Json }
      school_paid_students_count: {
        Args: { _school_id: string }
        Returns: number
      }
      school_per_student_threshold: {
        Args: { _school_id: string }
        Returns: number
      }
      school_storage_usage: {
        Args: never
        Returns: {
          bytes: number
          files: number
          school_id: string
        }[]
      }
      school_write_blocked: { Args: { _school_id: string }; Returns: boolean }
      start_trial_subscription: {
        Args: { p_plan_id: string; p_school_id: string }
        Returns: undefined
      }
      student_contribution_validated: {
        Args: { _academic_year?: string; _student_id: string }
        Returns: boolean
      }
      student_plan_paid: { Args: { _student_id: string }; Returns: boolean }
      student_recipient_users: {
        Args: { _student_id: string }
        Returns: {
          user_id: string
        }[]
      }
      teacher_teaches_class: {
        Args: { _class_id: string; _uid: string }
        Returns: boolean
      }
      teacher_teaches_student: {
        Args: { _student_id: string; _uid: string }
        Returns: boolean
      }
      verify_receipt: {
        Args: { _receipt_number: string }
        Returns: {
          amount: number
          class_name: string
          paid_at: string
          payment_method: string
          payment_type: string
          period: string
          receipt_number: string
          school_address: string
          school_logo_url: string
          school_name: string
          student_name: string
          validation_status: string
        }[]
      }
    }
    Enums: {
      account_type:
        | "caisse"
        | "banque"
        | "mobile_money"
        | "orange_money"
        | "autre"
      app_role:
        | "admin"
        | "directeur"
        | "enseignant"
        | "secretariat"
        | "bibliothecaire"
        | "infirmerie"
        | "educatrice_maternelle"
        | "responsable_transport"
        | "responsable_cantine"
        | "rh"
        | "parent"
        | "eleve"
        | "comptable"
        | "surveillant"
        | "directeur_etudes"
        | "proviseur"
      contract_status: "actif" | "suspendu" | "termine"
      exam_type: "composition" | "devoir" | "controle" | "examen"
      expense_type:
        | "salaires"
        | "fournitures"
        | "eau"
        | "electricite"
        | "internet"
        | "entretien"
        | "carburant"
        | "autres"
      leave_status: "en_attente" | "approuve" | "refuse"
      leave_type: "annuel" | "maladie" | "maternite" | "sans_solde" | "autre"
      payment_method:
        | "especes"
        | "cheque"
        | "virement"
        | "mobile_money"
        | "orange_money"
        | "autre"
      revenue_type:
        | "inscription"
        | "reinscription"
        | "scolarite"
        | "transport"
        | "cantine"
        | "uniforme"
        | "examens"
        | "autres"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: [
        "caisse",
        "banque",
        "mobile_money",
        "orange_money",
        "autre",
      ],
      app_role: [
        "admin",
        "directeur",
        "enseignant",
        "secretariat",
        "bibliothecaire",
        "infirmerie",
        "educatrice_maternelle",
        "responsable_transport",
        "responsable_cantine",
        "rh",
        "parent",
        "eleve",
        "comptable",
        "surveillant",
        "directeur_etudes",
        "proviseur",
      ],
      contract_status: ["actif", "suspendu", "termine"],
      exam_type: ["composition", "devoir", "controle", "examen"],
      expense_type: [
        "salaires",
        "fournitures",
        "eau",
        "electricite",
        "internet",
        "entretien",
        "carburant",
        "autres",
      ],
      leave_status: ["en_attente", "approuve", "refuse"],
      leave_type: ["annuel", "maladie", "maternite", "sans_solde", "autre"],
      payment_method: [
        "especes",
        "cheque",
        "virement",
        "mobile_money",
        "orange_money",
        "autre",
      ],
      revenue_type: [
        "inscription",
        "reinscription",
        "scolarite",
        "transport",
        "cantine",
        "uniforme",
        "examens",
        "autres",
      ],
    },
  },
} as const
