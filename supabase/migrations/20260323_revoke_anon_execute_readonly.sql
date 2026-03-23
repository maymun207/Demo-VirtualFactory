-- ============================================================================
-- Migration: Revoke anon EXECUTE on SECURITY DEFINER RPC functions
-- Date: 2026-03-23
-- ============================================================================
--
-- WHY: execute_readonly_query(TEXT) and get_simulation_stats(UUID) are both
-- declared as SECURITY DEFINER, meaning they run with the privileges of the
-- DB owner and bypass Row Level Security entirely.
--
-- The original migration (20260225_cwf_agent_rpc.sql) granted EXECUTE to
-- the `anon` role. This means any unauthenticated browser client could call
-- these functions with arbitrary SELECT queries against the entire database,
-- creating a privilege escalation vulnerability.
--
-- These functions are called exclusively by the CWF serverless function
-- (api/cwf/chat.ts), which authenticates with SUPABASE_SERVICE_ROLE_KEY.
-- The service_role bypasses RLS by design and has implicit EXECUTE on all
-- functions — the anon grant is therefore unnecessary and dangerous.
--
-- This migration revokes the anon grants without modifying the original
-- migration file (which has already been applied to production).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.execute_readonly_query(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_simulation_stats(UUID) FROM anon;
