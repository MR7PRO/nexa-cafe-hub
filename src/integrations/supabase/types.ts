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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details_json: Json | null
          entity: string
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details_json?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details_json?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string
          default_rate_plan_id: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          type: Database["public"]["Enums"]["device_type"]
        }
        Insert: {
          created_at?: string
          default_rate_plan_id?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          type?: Database["public"]["Enums"]["device_type"]
        }
        Update: {
          created_at?: string
          default_rate_plan_id?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          type?: Database["public"]["Enums"]["device_type"]
        }
        Relationships: [
          {
            foreignKeyName: "devices_default_rate_plan_id_fkey"
            columns: ["default_rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_ils: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          title: string
        }
        Insert: {
          amount_ils: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          title: string
        }
        Update: {
          amount_ils?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          title?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_ils: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          ticket_id: string
        }
        Insert: {
          amount_ils: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          ticket_id: string
        }
        Update: {
          amount_ils?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          cost_price_ils: number | null
          created_at: string
          id: string
          is_active: boolean
          low_stock_threshold: number | null
          name: string
          sell_price_ils: number
          stock_qty: number | null
        }
        Insert: {
          category_id?: string | null
          cost_price_ils?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number | null
          name: string
          sell_price_ils: number
          stock_qty?: number | null
        }
        Update: {
          category_id?: string | null
          cost_price_ils?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number | null
          name?: string
          sell_price_ils?: number
          stock_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string
          pin_hash: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          pin_hash?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pin_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_plans: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          min_charge_ils: number | null
          name: string
          price_per_hour_ils: number
          rounding_minutes: number | null
          schedule_rules_json: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          min_charge_ils?: number | null
          name: string
          price_per_hour_ils: number
          rounding_minutes?: number | null
          schedule_rules_json?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          min_charge_ils?: number | null
          name?: string
          price_per_hour_ils?: number
          rounding_minutes?: number | null
          schedule_rules_json?: Json | null
        }
        Relationships: []
      }
      reservations: {
        Row: {
          created_at: string
          created_by: string | null
          customer_name: string
          customer_phone: string | null
          device_id: string
          end_time: string
          id: string
          notes: string | null
          reserved_date: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_name: string
          customer_phone?: string | null
          device_id: string
          end_time: string
          id?: string
          notes?: string | null
          reserved_date: string
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_name?: string
          customer_phone?: string | null
          device_id?: string
          end_time?: string
          id?: string
          notes?: string | null
          reserved_date?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          controller_count: number | null
          created_at: string
          created_by: string | null
          device_id: string
          end_time: string | null
          id: string
          pause_started_at: string | null
          paused_seconds: number
          rate_plan_id: string
          session_mode: string | null
          start_time: string
          status: Database["public"]["Enums"]["session_status"]
          timer_minutes: number | null
        }
        Insert: {
          controller_count?: number | null
          created_at?: string
          created_by?: string | null
          device_id: string
          end_time?: string | null
          id?: string
          pause_started_at?: string | null
          paused_seconds?: number
          rate_plan_id: string
          session_mode?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["session_status"]
          timer_minutes?: number | null
        }
        Update: {
          controller_count?: number | null
          created_at?: string
          created_by?: string | null
          device_id?: string
          end_time?: string | null
          id?: string
          pause_started_at?: string | null
          paused_seconds?: number
          rate_plan_id?: string
          session_mode?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["session_status"]
          timer_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      shifts: {
        Row: {
          close_time: string | null
          closing_cash_ils: number | null
          created_at: string
          difference_ils: number | null
          employee_id: string
          expected_cash_ils: number | null
          id: string
          open_time: string
          opening_cash_ils: number
        }
        Insert: {
          close_time?: string | null
          closing_cash_ils?: number | null
          created_at?: string
          difference_ils?: number | null
          employee_id: string
          expected_cash_ils?: number | null
          id?: string
          open_time?: string
          opening_cash_ils?: number
        }
        Update: {
          close_time?: string | null
          closing_cash_ils?: number | null
          created_at?: string
          difference_ils?: number | null
          employee_id?: string
          expected_cash_ils?: number | null
          id?: string
          open_time?: string
          opening_cash_ils?: number
        }
        Relationships: []
      }
      ticket_items: {
        Row: {
          created_at: string
          id: string
          item_type: Database["public"]["Enums"]["item_type"]
          name: string
          qty: number
          ref_id: string | null
          ticket_id: string
          total_ils: number
          unit_price_ils: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_type: Database["public"]["Enums"]["item_type"]
          name: string
          qty?: number
          ref_id?: string | null
          ticket_id: string
          total_ils: number
          unit_price_ils: number
        }
        Update: {
          created_at?: string
          id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          name?: string
          qty?: number
          ref_id?: string | null
          ticket_id?: string
          total_ils?: number
          unit_price_ils?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          discount_ils: number
          id: string
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_no: string
          total_ils: number
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          discount_ils?: number
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_no: string
          total_ils?: number
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          discount_ils?: number
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_no?: string
          total_ils?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "cashier"
      device_type: "playstation" | "pc"
      item_type: "session" | "product"
      payment_method: "cash" | "card" | "mixed"
      session_status: "running" | "paused" | "ended"
      ticket_status: "open" | "paid" | "void"
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
      app_role: ["admin", "manager", "cashier"],
      device_type: ["playstation", "pc"],
      item_type: ["session", "product"],
      payment_method: ["cash", "card", "mixed"],
      session_status: ["running", "paused", "ended"],
      ticket_status: ["open", "paid", "void"],
    },
  },
} as const
