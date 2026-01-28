-- Add timer mode and controller count to sessions table
ALTER TABLE public.sessions
ADD COLUMN session_mode TEXT DEFAULT 'meter' CHECK (session_mode IN ('meter', 'timer')),
ADD COLUMN timer_minutes INTEGER DEFAULT NULL,
ADD COLUMN controller_count INTEGER DEFAULT 1;

-- Add comment for documentation
COMMENT ON COLUMN public.sessions.session_mode IS 'Session mode: meter (count up) or timer (countdown)';
COMMENT ON COLUMN public.sessions.timer_minutes IS 'Duration in minutes for timer mode';
COMMENT ON COLUMN public.sessions.controller_count IS 'Number of controllers used (multiplies pricing for PlayStation)';