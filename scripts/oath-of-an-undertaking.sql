-- Run the whole script in the Supabase SQL Editor after the document-text migration.
-- Adds one published document, its abstract and two linked glossary entries.
-- Reruns update authored text but preserve publication, archive, shelf, order and URL settings.
BEGIN;
SET LOCAL app.change_reason = 'Add The Oath of an Undertaking with abstract and related glossary';

CREATE TEMP TABLE undertaking_document (id text PRIMARY KEY, name text, summary text, body text) ON COMMIT DROP;
INSERT INTO undertaking_document VALUES (
 'DOC-TJAUKE-UNDERTAKING-OATH', 'The Oath of an Undertaking',
 $abstract$The declaration made before a Bound Hunt: the quarry chosen, the advantages surrendered, and the account owed on return. Sets out the witness's part, the limits of withdrawal, and the distinction between surviving an undertaking and earning its trophy.$abstract$,
 $document$## Before Departure
These words concern the Bound Hunt. Work undertaken for the defense of a vessel, the recovery of a companion or the containment of a threat is to be named for what it is. Not every duty requires a hunting oath.
The hunter first names the quarry and gives the reason for choosing it. The Honor Code decides whether it may be hunted. Our Measure asks whether it is worth choosing. A burden, however severe, gives no permission to hunt what the Code protects.
Name the weapons you intend to carry and the advantages you will surrender. Be precise. To leave a caster behind is not the same promise as to carry one and forbid its use. To forgo the cloak throughout the Hunt is not the same as to forgo it only when striking. Settle the meaning before departure.
A burden must cost the hunter an advantage they could otherwise use. It need not make the contest equal. Neither an empty restriction nor a promise made beyond your ability earns respect merely because it was spoken before others.

## The Declaration
I am [name]. I undertake the Hunt of [quarry]. I have observed [the conduct or ability by which I have measured it].
I will carry [weapons and equipment]. I bind myself to [restrictions, stated plainly]. These limits hold from the beginning of this Hunt until its end.
I will let the quarry come to know that it is hunted before I kill it. I will keep the restrictions I have named, whether witnessed or alone.
If I accept a greater burden, I will account for it. I will not reduce the burden already given.
If I withdraw, I will return an account of withdrawal. If another aids me, I will name the aid. If I break my word, I will not offer the trophy as proof that I kept it.
These are the terms by which I ask my Hunt to be judged.

## The Witness's Answer
I have heard the quarry named and the burden spoken. I will remember those terms as given. What I see, I will report. What I do not see, I will not claim to know.
The witness may question an unclear restriction before answering. A sponsor must do so where a candidate plainly does not understand the promise. Neither should let a foolish declaration pass merely to enjoy the failure that follows.
Witnessing the words does not certify the hunter's measure of the quarry or promise acceptance of the eventual claim. It establishes what was said. Where no companion is present, the hunter must still make the declaration before beginning and preserve it for the returned account. Solitude does not permit the terms to be written after the outcome is known.

## While Bound
Stalking and concealment remain available unless surrendered in the declaration. The quarry need not agree to a contest, and no formal exchange of challenges is required. It must, however, become aware of deliberate pursuit while it can still respond. A warning given to a corpse fulfills nothing.
The hunter may surrender a further advantage. They may not recover one already sworn away because the quarry proves stronger than expected. Poor measurement is to be answered for, not corrected by quietly changing the oath.
A broken weapon, an injury or a lost trail does not rewrite the declaration. Continue within it or abandon the Hunt. Any added restriction, interruption or assistance belongs in the account.

## Withdrawal and Other Duties
A hunter may withdraw. There may be shame in the reasons, and others may question the decision. An honest withdrawal is nevertheless different from an oath broken and concealed.
Withdrawal ends the attempt; it does not grant leave to finish the same pursuit with forbidden equipment. A hunter cannot lower a spear, announce that the Hunt has ended, and raise a caster to secure the trophy they were failing to earn.
Rescue, defense and containment may require the Hunt to end. Attend to that work under the Honor Code and give a separate account of it. Name when the purpose changed, what required the change and what force was used. Do not turn necessary intervention into a claim that the original burden was fulfilled.

## On Return
Give the declaration with the account. State what became of the quarry, whether it knew it was hunted, which restrictions were kept, and whose actions affected the result. A witness gives their own account; the hunter does not supply it for them.
Bringing back a trophy does not settle the claim. Nor does bringing back nothing conceal the decisions made along the way. Success, withdrawal, interruption and breach must be distinguished by those hearing the account.
The oath binds the hunter's conduct. It does not promise that the Hunt will succeed.$document$
);

CREATE TEMP TABLE undertaking_terms (id text PRIMARY KEY, name text, meaning text, usage text) ON COMMIT DROP;
INSERT INTO undertaking_terms VALUES
 ('GLS-TJAUKE-UNDERTAKING-OATH', 'Undertaking oath',
  'The declaration by which a Tjau''ke hunter names the quarry and binds a formal Hunt to stated restrictions.',
  'Made before the Hunt begins. Distinct from the clan membership oath; it neither permits forbidden prey nor guarantees acceptance of a trophy.'),
 ('GLS-TJAUKE-DECLARATION-WITNESS', 'Witness to the declaration',
  'One who hears and can attest to the terms a hunter gives before a Bound Hunt.',
  'Confirms what was declared, not events they did not observe. Hearing the oath does not itself endorse the quarry, confer rank or approve the returned claim.');

DO $apply$
DECLARE conflict_name text; next_order numeric;
BEGIN
 SELECT d.name INTO conflict_name FROM public.library d JOIN undertaking_document s
   ON lower(trim(d.name)) = lower(trim(s.name)) AND d.id <> s.id LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Document "%" already exists with another ID. Nothing saved.', conflict_name; END IF;
 SELECT g.name INTO conflict_name FROM public.glossary g JOIN undertaking_terms s
   ON lower(trim(g.name)) = lower(trim(s.name)) AND g.id <> s.id LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Glossary term "%" already exists with another ID. Nothing saved.', conflict_name; END IF;
 SELECT g.name INTO conflict_name FROM public.glossary g JOIN undertaking_terms s ON s.id = g.id
 WHERE g.doc IS DISTINCT FROM 'DOC-TJAUKE-UNDERTAKING-OATH' LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Glossary term "%" belongs to another document. Nothing saved.', conflict_name; END IF;

 SELECT coalesce(max("order"), 0) + 1 INTO next_order FROM public.library;
 INSERT INTO public.library AS existing (id, name, category, "order", summary, body, published, archived)
 SELECT id, name, 'Clan practice', next_order, summary, body, true, false FROM undertaking_document
 ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, summary = EXCLUDED.summary, body = EXCLUDED.body
 WHERE (existing.name, existing.summary, existing.body) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.summary, EXCLUDED.body);

 INSERT INTO public.glossary AS existing (id, name, meaning, status, category, usage, doc, published, archived)
 SELECT s.id, s.name, s.meaning, 'Provisional', 'Clan customs', s.usage, d.id, d.published AND NOT d.archived, false
 FROM undertaking_terms s CROSS JOIN public.library d WHERE d.id = 'DOC-TJAUKE-UNDERTAKING-OATH'
 ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, meaning = EXCLUDED.meaning, usage = EXCLUDED.usage
 WHERE (existing.name, existing.meaning, existing.usage) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.meaning, EXCLUDED.usage);
END;
$apply$;

SELECT d.id, d.name, d.summary AS abstract, d.published, d.archived,
 array_agg(g.name ORDER BY g.name) FILTER (WHERE g.id IS NOT NULL) AS related_glossary
FROM public.library d LEFT JOIN public.glossary g ON g.doc = d.id
WHERE d.id = 'DOC-TJAUKE-UNDERTAKING-OATH' GROUP BY d.id;
COMMIT;
