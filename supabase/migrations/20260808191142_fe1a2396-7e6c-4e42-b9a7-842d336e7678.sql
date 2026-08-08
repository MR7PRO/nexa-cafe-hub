REVOKE ALL ON FUNCTION public.next_ticket_no(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compute_promotion_discount(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_payment_parts(jsonb, numeric) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.process_sale(jsonb, jsonb, uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_session(uuid, jsonb, uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_session_billing(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.process_sale(jsonb, jsonb, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_session(uuid, jsonb, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_session_billing(uuid) TO authenticated;