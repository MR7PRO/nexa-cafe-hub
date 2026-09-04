REVOKE EXECUTE ON FUNCTION public.restock_product(uuid, integer, numeric, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.adjust_stock(uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_inventory_movements(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restock_product(uuid, integer, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_movements(uuid, integer, integer) TO authenticated;