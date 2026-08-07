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
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details_json?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details_json?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_balances: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          package_id: string
          purchased_at: string
          remaining_minutes: number
          sold_by: string | null
          tenant_id: string | null
          total_minutes: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          package_id: string
          purchased_at?: string
          remaining_minutes: number
          sold_by?: string | null
          tenant_id?: string | null
          total_minutes: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          package_id?: string
          purchased_at?: string
          remaining_minutes?: number
          sold_by?: string | null
          tenant_id?: string | null
          total_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_balances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_balances_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "loyalty_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          default_rate_plan_id: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          tenant_id: string | null
          type: Database["public"]["Enums"]["device_type"]
        }
        Insert: {
          created_at?: string
          default_rate_plan_id?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          tenant_id?: string | null
          type?: Database["public"]["Enums"]["device_type"]
        }
        Update: {
          created_at?: string
          default_rate_plan_id?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          tenant_id?: string | null
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
          {
            foreignKeyName: "devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string | null
          title: string
        }
        Insert: {
          amount_ils: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          amount_ils?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          used_count: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          used_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          used_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_packages: {
        Row: {
          bonus_hours: number
          created_at: string
          hours_included: number
          id: string
          is_active: boolean
          name: string
          price_ils: number
          tenant_id: string | null
        }
        Insert: {
          bonus_hours?: number
          created_at?: string
          hours_included: number
          id?: string
          is_active?: boolean
          name: string
          price_ils: number
          tenant_id?: string | null
        }
        Update: {
          bonus_hours?: number
          created_at?: string
          hours_included?: number
          id?: string
          is_active?: boolean
          name?: string
          price_ils?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_ils: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          tenant_id: string | null
          ticket_id: string
        }
        Insert: {
          amount_ils: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          tenant_id?: string | null
          ticket_id: string
        }
        Update: {
          amount_ils?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          tenant_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          name: string
          pin_hash: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          name: string
          pin_hash?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string
          pin_hash?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          applies_to: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          start_date: string
          tenant_id: string | null
        }
        Insert: {
          applies_to?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          start_date?: string
          tenant_id?: string | null
        }
        Update: {
          applies_to?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          id: string
          key: string
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
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
      ticket_items: {
        Row: {
          created_at: string
          id: string
          item_type: Database["public"]["Enums"]["item_type"]
          name: string
          qty: number
          ref_id: string | null
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          ticket_id?: string
          total_ils?: number
          unit_price_ils?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          ticket_no?: string
          total_ils?: number
        }
        Relationships: [
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      end_session: { Args: { p_session_id: string }; Returns: undefined }
      get_profile_pin_hash: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      pause_session: { Args: { p_session_id: string }; Returns: undefined }
      resume_session: { Args: { p_session_id: string }; Returns: undefined }
      start_session: {
        Args: {
          p_controller_count?: number
          p_customer_balance_id?: string
          p_deduct_minutes?: number
          p_device_id: string
          p_rate_plan_id: string
          p_session_mode?: string
          p_timer_minutes?: number
        }
        Returns: string
      }
      transfer_session: {
        Args: { p_session_id: string; p_target_device_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "cashier" | "super_admin"
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
      app_role: ["admin", "manager", "cashier", "super_admin"],
      device_type: ["playstation", "pc"],
      item_type: ["session", "product"],
      payment_method: ["cash", "card", "mixed"],
      session_status: ["running", "paused", "ended"],
      ticket_status: ["open", "paid", "void"],
    },
  },
} as const
