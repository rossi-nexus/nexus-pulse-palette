
-- Drop helpers
DROP FUNCTION IF EXISTS public.fn_verify_phase52c_setup();
DROP FUNCTION IF EXISTS public.fn_verify_phase52c_as_user(uuid, text, jsonb);

-- Clean up test data
DELETE FROM public.verification_events WHERE actor_id IN (
  '47bebbb6-43f6-4984-b6ed-a07723042667',
  '09cc59e9-bbee-49ce-a852-c2db5f4a653d',
  '238558db-cbcd-40f0-97d4-f21dc21446b4'
);
DELETE FROM public.actor_validation_queue WHERE id IN (
  'acf16f52-325c-4bc7-93c4-51ff72536ed8',
  '50da3016-f68a-44b0-aa0b-5ebfea09faa2',
  '822a0c0d-52a8-427b-ae18-cd6f0dedd6b8',
  '0c4aa77a-64be-4a9d-8f7a-5e94f8f7048c'
);
DELETE FROM public.user_personal_actors WHERE id IN (
  '8319360b-9fb0-45a8-9b5a-2299a25a83b4',
  '0d71bcbe-5743-441f-b5cf-c04c8822bdb4',
  '1d920d46-bb3a-4df4-8cff-73fec5f1d330',
  'bdcd8c7d-af31-46a4-acae-75149807be73'
);
DELETE FROM public.actors WHERE id IN (
  '47bebbb6-43f6-4984-b6ed-a07723042667',
  '09cc59e9-bbee-49ce-a852-c2db5f4a653d',
  '238558db-cbcd-40f0-97d4-f21dc21446b4'
);
DELETE FROM public.programme_members WHERE programme_id = 'ba9baf17-fa55-41d2-8985-a1f6328d4be4';
DELETE FROM public.programmes WHERE id = 'ba9baf17-fa55-41d2-8985-a1f6328d4be4';
