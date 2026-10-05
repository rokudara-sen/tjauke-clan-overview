-- Run the entire script in the Supabase SQL Editor after the document-text migration.
-- Adds a published document and two related glossary entries; does not create a real dispute or judgment record.
-- Stable IDs prevent duplicates on reruns. Existing publication and other document settings are preserved.
BEGIN;
SET LOCAL app.change_reason = 'Add A Petition Before the Elders with abstract and related glossary';

CREATE TEMP TABLE petition_document (id text PRIMARY KEY, name text, summary text, body text) ON COMMIT DROP;
INSERT INTO petition_document VALUES (
 'DOC-TJAUKE-PETITION-ELDERS', 'A Petition Before the Elders',
 $abstract$A hunter requests a hearing over a disputed account: a forbidden weapon was used after an alleged withdrawal, during the recovery of an injured companion. The petition names the evidence, acknowledges its limits and asks for a corrected account rather than recognition of a trophy. No ruling accompanies it.$abstract$,
 $document$## The Matter Brought
To the elders hearing the accounts of our household:
I ask you to hear the return from the lower ravine again. The account entered against me states that I broke the burden of my Hunt. It records the discharge of my caster, but it does not record why I fired or that I had already abandoned the pursuit.
My sponsor holds that I called the Hunt ended only when keeping the oath became inconvenient. I have answered him twice. On the second occasion he told me that repeating my answer would not improve it. I bring the matter here because the account remains unchanged and the witnesses have not been heard together.

## What I Accept
I swore not to use the caster during that Hunt. I broke its seal and fired it. The marks on the housing are mine. I have not claimed that the weapon discharged by fault or that another hunter handled it.
I also accept that the quarry had escaped my sight before I turned back. I had lost ground and was uncertain of its route. If the elders judge my pursuit poorly conducted, there is enough in my own account to support that judgment.
I brought back no trophy and request none. I am not asking that the rescue be counted in place of the Hunt I failed to complete.

## The Sequence I Give
I heard my companion fall behind the broken retaining wall. When I reached him, the stone had pinned his leg and part of his equipment. He could speak. He could not free himself.
I told him I was abandoning the Hunt and would bring him out. He answered that the stone would have to be shifted before I tried to pull him. I tried the lifting bar from his pack. Its end bent. He then lost feeling in the trapped foot.
I broke the caster seal and fired into the outer support. I fired twice. The first discharge fractured the facing without releasing the weight. The second allowed me to move it with the bar. I did not fire at the quarry, pursue it afterward, or take anything from it.
My sponsor reached us after the first discharge. He saw the open seal, the second shot and the work of extraction. He did not hear the words spoken when I first reached my companion.

## What Can Be Examined
My mask record ends during the descent. I damaged its connection against the wall. I cannot offer a recording of my withdrawal and will not ask the elders to treat a missing record as proof in my favour.
My companion heard me. He also depended upon me to remove the stone. That gives him reason to favour my account, and I ask that his testimony be heard with that understood. It does not make him absent from the place where the words were spoken.
The damaged bar was returned with his equipment. The hunter who treated his leg can speak to the injury, but not to my intention. My sponsor can speak to what he saw upon arrival. None of us can supply another's sight.
I ask that each be questioned separately before we are called together. Let my companion give the words he remembers before he hears me repeat mine.

## The Remedy Requested
I ask for a finding on whether the Hunt had ended before I used the caster. If it had, let the account distinguish the abandoned pursuit from the recovery that followed. If it had not, let the elders state which act or omission kept me bound to it.
My sponsor has withheld his recommendation for another Hunt until I admit the breach as recorded. I ask that further instruction be settled after the hearing. If he will no longer teach me, let that be spoken plainly so another arrangement can be considered.
I am willing to repeat the tracking exercises. I am willing to answer for damaging the recording connection and for leaving my companion beyond my sight. I cannot give an admission I believe false merely to obtain permission to depart again.

## Concerning My Sponsor
I have not accused my sponsor of altering evidence. He has given the account as he understands it. He taught me to declare an end to the Hunt before taking up work that required the full use of my equipment. I believe I followed that instruction. He believes I used it as an excuse.
He has witnessed my failures before and has not always judged them harshly. I include that because this petition should not be read as an account of every season under his teaching.
I ask that the decision be heard by elders who were not witnesses in the ravine. I will attend with the damaged equipment and answer their questions. My sponsor should have the same opportunity to answer mine.

## The Record Kept
No ruling accompanies this copy. The allegation, the petitioner's sequence and the requested remedies remain distinct. Neither acceptance of the petition nor its preservation in the archive establishes which account is correct.$document$
);

CREATE TEMP TABLE petition_terms (id text PRIMARY KEY, name text, meaning text, usage text) ON COMMIT DROP;
INSERT INTO petition_terms VALUES
 ('GLS-TJAUKE-PETITION-ELDERS', 'Petition before the elders',
  'A request that the elders hear a grievance or disputed account and consider a stated remedy.',
  'The petition identifies what is alleged, what the petitioner accepts, what may be examined and what outcome is requested. Receiving it is not a finding in the petitioner''s favour.'),
 ('GLS-TJAUKE-CONTESTED-WITHDRAWAL', 'Contested withdrawal',
  'A dispute over whether a hunter had ended a declared Hunt before an act that would otherwise breach its burden.',
  'In this petition, the dispute concerns the timing and purpose of weapon use during a rescue. The account is unresolved and does not establish a precedent or create an exception to the Honor Code.');

DO $apply$
DECLARE conflict_name text; next_order numeric;
BEGIN
 SELECT d.name INTO conflict_name FROM public.library d
 WHERE lower(trim(d.name)) = lower('A Petition Before the Elders')
   AND d.id <> 'DOC-TJAUKE-PETITION-ELDERS' LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Document "%" already exists with another ID. Nothing saved.', conflict_name; END IF;
 SELECT g.name INTO conflict_name FROM public.glossary g JOIN petition_terms s
   ON lower(trim(g.name)) = lower(trim(s.name)) AND g.id <> s.id LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Glossary term "%" already exists with another ID. Nothing saved.', conflict_name; END IF;
 SELECT g.name INTO conflict_name FROM public.glossary g JOIN petition_terms s ON s.id = g.id
 WHERE g.doc IS DISTINCT FROM 'DOC-TJAUKE-PETITION-ELDERS' LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Glossary term "%" belongs to another document. Nothing saved.', conflict_name; END IF;

 SELECT coalesce(max("order"), 0) + 1 INTO next_order FROM public.library;
 INSERT INTO public.library AS existing (id, name, category, "order", summary, body, published, archived)
 SELECT id, name, 'Petitions and judgments', next_order, summary, body, true, false FROM petition_document
 ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, summary = EXCLUDED.summary, body = EXCLUDED.body
 WHERE (existing.name, existing.summary, existing.body) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.summary, EXCLUDED.body);

 INSERT INTO public.glossary AS existing (id, name, meaning, status, category, usage, doc, published, archived)
 SELECT s.id, s.name, s.meaning, 'Provisional', 'Clan customs', s.usage, d.id, d.published AND NOT d.archived, false
 FROM petition_terms s CROSS JOIN public.library d WHERE d.id = 'DOC-TJAUKE-PETITION-ELDERS'
 ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, meaning = EXCLUDED.meaning, usage = EXCLUDED.usage
 WHERE (existing.name, existing.meaning, existing.usage) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.meaning, EXCLUDED.usage);
END;
$apply$;

SELECT d.id, d.name, d.summary AS abstract, d.published, d.archived,
 array_agg(g.name ORDER BY g.name) FILTER (WHERE g.id IS NOT NULL) AS related_glossary
FROM public.library d LEFT JOIN public.glossary g ON g.doc = d.id
WHERE d.id = 'DOC-TJAUKE-PETITION-ELDERS' GROUP BY d.id;
COMMIT;
