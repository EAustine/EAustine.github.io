-- Matte share links
-- Paste this whole file into the Supabase SQL editor and press Run. Once.
--
-- Only pressing "Create a link" uploads anything. Editing, colour extraction
-- and export all stay in the browser, so this bucket only ever receives an
-- image somebody deliberately chose to share.

-- The limits live on the bucket rather than in the policy, because Storage
-- enforces mime type and size before the object is written. Uploads are
-- anonymous, so these are the only guards there are: PNG only, 8 MB ceiling.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('matte-shares', 'matte-shares', true, 8388608, array['image/png'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Insert only. No update policy and no delete policy, so a shared image cannot
-- be swapped for something else after the link has been passed around.
drop policy if exists "anyone may add a share" on storage.objects;
create policy "anyone may add a share"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'matte-shares');

-- Reads need no policy: a public bucket serves through
--   /storage/v1/object/public/matte-shares/<name>
-- and that path is the only way anyone reaches these files. Names are 32 hex
-- characters from crypto.getRandomValues, so the bucket cannot be browsed by
-- guessing.

-- WORTH KNOWING: nothing here expires. If shared images should not live
-- forever, add a scheduled job that deletes from storage.objects where
-- bucket_id = 'matte-shares' and created_at < now() - interval '30 days'.
