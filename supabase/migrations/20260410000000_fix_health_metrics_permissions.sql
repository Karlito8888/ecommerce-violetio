-- Fix Bug #12: fn_health_metrics permission denied for service_role
--
-- The migration 20260406 moved fn_health_metrics to private schema and created
-- a public SECURITY INVOKER wrapper. However, it revoked EXECUTE from all roles
-- without granting access to service_role on the private function and schema.
--
-- Since the public wrapper uses SECURITY INVOKER, the calling role (service_role)
-- needs both USAGE on the private schema and EXECUTE on the private function.

GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.fn_health_metrics(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_health_metrics(INTEGER) TO service_role;

-- Also grant service_role access to private.refresh_dashboard_views which was
-- moved to private schema in the same migration.
GRANT EXECUTE ON FUNCTION private.refresh_dashboard_views() TO service_role;
