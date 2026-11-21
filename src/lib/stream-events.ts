// Awaits a public.stream_events insert and logs any failure without throwing.
// Supabase returns constraint violations (stream_events_status_check,
// stream_events_station_check) in `error` instead of throwing, so an unchecked
// insert drops the row silently. Logging is non-fatal: the caller's HTTP
// response never depends on whether the log row was written.
export async function logStreamEventResult(
  route: string,
  insert: PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  try {
    const { error } = await insert
    if (error) console.error(`[${route}] stream_events insert failed: ${error.message}`)
  } catch (e) {
    console.error(`[${route}] stream_events insert threw: ${e instanceof Error ? e.message : String(e)}`)
  }
}
