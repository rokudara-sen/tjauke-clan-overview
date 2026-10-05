-- Run the entire script in the Supabase SQL Editor after the document-text migration.
-- Adds one published document and two related glossary entries. Safe to rerun.
-- Existing publication, archive, shelf, reading-order and URL settings are preserved on reruns.
BEGIN;
SET LOCAL app.change_reason = 'Add The Oath of Tjau''ke with abstract and related glossary';

CREATE TEMP TABLE oath_document (id text PRIMARY KEY, name text, summary text, body text) ON COMMIT DROP;
INSERT INTO oath_document VALUES (
 'DOC-TJAUKE-OATH', 'The Oath of Tjau’ke',
 $abstract$The words spoken by a hunter entering Tjau'ke, the answering obligation of the household receiving them, and the witnessed settlement required before departure. Joining the clan does not itself confer a rank or validate a trophy.$abstract$,
 $document$## Before the Words
The hunter gives their name before the household receiving them. Their sponsor stands with them, or, where instruction is no longer required, the hunter who has agreed to speak for their admission. Those present must hear both the oath and the answer.
Any obligation that may prevent the hunter from keeping these words is to be named before they are spoken. Debts, dependants and promises made elsewhere do not cease to exist because a new household offers a place.
No one speaks the oath on another's behalf.

## The Hunter's Oath
I give my name to Tjau'ke. I ask a place among its households and accept the duties of that place.
I will keep the Honor Code. Among the quarry it permits, I will make my own measure. I will observe before choosing and answer for what I choose. Another hunter's praise will not stand in place of my judgment.
Before a Hunt, I will name the burden I accept. I will make its limits plain enough to be remembered and judged. I will not lessen them because I have become afraid, because the quarry has surprised me, or because no witness is near.
I will see that the quarry comes to know it is hunted before I take its trophy. I may stalk, conceal myself and choose my moment. I will not claim that an unwitting kill fulfilled the Hunt I declared.
If I withdraw, I will say that I withdrew. If another's hand changes the outcome, I will name that hand. I will give the account as it happened, including the parts that diminish me.
I will not use a Hunt to neglect a companion in need of rescue or a duty accepted in the clan's defense. When such work ends the Hunt, I will distinguish what I did in that work from what I claim as a hunter.
I will return what I borrow, acknowledge what I damage, and discharge the debts I accept. When I cannot keep a promise, I will bring the failure to those who must bear it. I will not leave them to discover it in my absence.
I will give honest witness for those beside me. I will neither conceal their fault for affection nor enlarge it for advantage. If I accuse, I will stand before the answer. If I am accused, I will give my own.
What I know well enough to teach, I will teach faithfully. Where I lack knowledge, I will seek it. Those placed in my care will not be made to carry a promise I accepted for them without their understanding.
I bring the obligations I have named. I accept those spoken here. Let my conduct be entered beside these words.

## The Household's Answer
We have heard your name and the obligations you bring. We receive you into this household before those assembled.
You will have a place at our hearth, a share of the work, and instruction in the duties given to you. We will tell you what is expected before holding you to it.
Your account will be heard. Where you are accused, the accusation will be spoken plainly and the witness examined. Where you have earned recognition, we will not withhold it because you arrived without kin among us.
We will ask your aid when it is needed and answer your call when we are able. If we cannot answer, we will not conceal that failure from those who ask what became of you.
The same witnesses who heard your promise have heard ours.

## What the Oath Establishes
The oath establishes the hunter's place in the clan. It does not blood a candidate, raise a warrior's rank, appoint an officer or settle a disputed claim. Those matters require their own accounts and judgments.
A household may teach its customs alongside these words. It must distinguish its own practice from an obligation undertaken by the whole clan. A senior who gives an instruction remains answerable for that instruction; naming a duty does not place it beyond examination.
The names of the hunter, the receiving household and the witnesses are kept with the record. A hunter received from elsewhere need not deny where they were taught. They must make clear which obligations they now accept and which earlier ones remain.

## Leaving the Clan
A hunter seeking to leave brings that intention before the household senior. Borrowed equipment, accepted duties, dependants placed in their care and unsettled claims are to be accounted for. Where work must pass to another, the other must be heard accepting it.
The settlement is witnessed. It records what has been discharged, what continues by agreement, and what remains disputed. Departure cannot make an unpaid debt disappear, and a household must not invent a debt merely to prevent departure.
The old accounts remain. Neither service nor misconduct is erased by the ending of membership. Those who gave witness are still responsible for what they said.
Until the settlement is made, absence alone is not release.$document$
);

CREATE TEMP TABLE oath_terms (id text PRIMARY KEY, name text, meaning text, usage text) ON COMMIT DROP;
INSERT INTO oath_terms VALUES
 ('GLS-TJAUKE-CLAN-OATH', 'Clan oath',
  'The witnessed promises through which a hunter enters Tjau''ke and a household accepts responsibility for receiving them.',
  'Includes both the hunter''s words and the household''s answer. Membership does not by itself confer Blooding, rank, office or acceptance of a trophy claim.'),
 ('GLS-TJAUKE-WITNESSED-DEPARTURE', 'Witnessed departure',
  'The recorded settlement of duties, property and obligations when a hunter leaves the clan.',
  'Distinguishes discharged obligations, continuing agreements and disputes. It neither erases earlier accounts nor allows a household to invent debts to retain a member.');

DO $apply$
DECLARE conflict_name text; next_order numeric;
BEGIN
 SELECT d.name INTO conflict_name FROM public.library d
 WHERE lower(translate(trim(d.name), '’‘', $$''$$)) = lower('The Oath of Tjau''ke')
   AND d.id <> 'DOC-TJAUKE-OATH' LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Document "%" already exists with another ID. Nothing saved.', conflict_name; END IF;
 SELECT g.name INTO conflict_name FROM public.glossary g JOIN oath_terms s
   ON lower(trim(g.name)) = lower(trim(s.name)) AND g.id <> s.id LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Glossary term "%" already exists with another ID. Nothing saved.', conflict_name; END IF;
 SELECT g.name INTO conflict_name FROM public.glossary g JOIN oath_terms s ON s.id = g.id
 WHERE g.doc IS DISTINCT FROM 'DOC-TJAUKE-OATH' LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Glossary term "%" belongs to another document. Nothing saved.', conflict_name; END IF;

 SELECT coalesce(max("order"), 0) + 1 INTO next_order FROM public.library;
 INSERT INTO public.library AS existing (id, name, category, "order", summary, body, published, archived)
 SELECT id, name, 'Clan practice', next_order, summary, body, true, false FROM oath_document
 ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, summary = EXCLUDED.summary, body = EXCLUDED.body
 WHERE (existing.name, existing.summary, existing.body) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.summary, EXCLUDED.body);

 INSERT INTO public.glossary AS existing (id, name, meaning, status, category, usage, doc, published, archived)
 SELECT s.id, s.name, s.meaning, 'Provisional', 'Clan customs', s.usage, d.id, d.published AND NOT d.archived, false
 FROM oath_terms s CROSS JOIN public.library d WHERE d.id = 'DOC-TJAUKE-OATH'
 ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, meaning = EXCLUDED.meaning, usage = EXCLUDED.usage
 WHERE (existing.name, existing.meaning, existing.usage) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.meaning, EXCLUDED.usage);
END;
$apply$;

SELECT d.id, d.name, d.summary AS abstract, d.published, d.archived,
 array_agg(g.name ORDER BY g.name) FILTER (WHERE g.id IS NOT NULL) AS related_glossary
FROM public.library d LEFT JOIN public.glossary g ON g.doc = d.id
WHERE d.id = 'DOC-TJAUKE-OATH' GROUP BY d.id;
COMMIT;
