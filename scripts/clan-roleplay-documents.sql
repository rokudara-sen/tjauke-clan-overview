-- Run this entire script in the Supabase SQL Editor after the document-text migration.
-- Updates the named sponsor document and adds three published documents plus eight glossary entries.
-- Existing document publication, archive, shelf, reading-order and URL settings are preserved.
-- Stable IDs make repeat runs update these same records. Existing unrelated glossary links stay intact.
BEGIN;
SET LOCAL app.change_reason = 'Add clan-life documents, sponsor abstract and related glossary';

CREATE TEMP TABLE roleplay_documents (
  id text PRIMARY KEY, name text NOT NULL, category text NOT NULL,
  sequence integer NOT NULL, summary text NOT NULL, body text NOT NULL
) ON COMMIT DROP;

INSERT INTO roleplay_documents VALUES
('DOC-74aebe45-48cc-425d-972f-09cbbecf1d0d', 'Obligations of a Sponsor', 'Clan practice', 0,
$abstract$Instruction for those who take responsibility for a candidate: choosing a burden, witnessing the Hunt, acknowledging intervention, judging the returned account and passing the obligation to another.$abstract$,
$document$> "CHOOSE YOUR BURDEN. HONOR YOUR OATH."

## Taking a Candidate
Before you speak for a candidate, know whom you are taking into your care. Hunt beside them. Watch them maintain their weapons, endure correction, and answer for a mistake. Hear how they describe prey when there is no trophy before them and no audience to impress.
When you name yourself sponsor, your own judgment enters the account. You have said that this hunter is worth teaching and that you will remain to do the teaching. A household name, an old friendship, or a promise made to the candidate's kin does not discharge that obligation.
Do not accept a candidate merely to keep them from another teacher. Do not collect pupils whose names you remember only when they succeed.

## What Must Be Taught
Teach the Honor Code and whom it permits the hunter to pursue. Then teach the Measure of Prey. Require the candidate to explain what they have witnessed: how the quarry acts under threat, what it understands, what strength it possesses, and what makes its pursuit worth undertaking. Skill in forbidden quarry gives no permission to hunt it.
Teach them to make the Hunt known. The quarry must come to understand that it is being hunted before its trophy is taken. It need not accept a challenge, and the hunter need not abandon concealment. Require the candidate to distinguish a quarry that knows it is pursued from one that merely fears the dark.
Teach the care of equipment, the recognition of wounds, the keeping of an account, and the means of returning home. A candidate who can kill but cannot recognise when a Hunt has ended has been poorly instructed.

## Choosing the Burden
Hear the burden before departure. Have the candidate speak it plainly, including what they surrender and when the restriction begins. If the words conceal an escape, require clearer words.
The burden belongs to the hunter who accepts it. You may refuse to approve a foolish undertaking. You may require further preparation. You must not shame a candidate into an oath they do not understand, then praise yourself for the severity of their trial.
A candidate who copies your restrictions has not necessarily learned your judgment. Ask why those restrictions suit this quarry, on this ground, with the skill the candidate presently possesses.
Once the oath is given, teach them to keep it. A burden may be made greater. It may not be made lighter because the quarry proved troublesome.

## During the Hunt
Give instruction before the contest. During it, leave room for the candidate's own decisions. Do not steer every step, reveal every hiding place, or arrange a weakened quarry and call the result a first Hunt.
Your presence does not make the candidate's claim your property. Neither does it excuse you from observing carefully. Remember what you saw, including what reflects badly upon your teaching.
Where you could not see, say so. Where another hunter intervened, name them. Do not allow affection for a pupil to turn uncertainty into testimony.

## Intervention and Withdrawal
A candidate may withdraw. You may judge that withdrawal premature, fearful, or necessary. Hear the account before deciding which it was.
If you intervene to preserve a life, acknowledge the intervention. The rescued hunter owes an honest account; you owe one also. A life preserved does not require a trophy to justify its preservation.
When defense, rescue, or failed containment ends the Hunt, act as the circumstances demand. Afterward, distinguish those acts from the declared contest. Neither sponsor nor candidate may use the emergency to conceal a forbidden advantage taken against the original quarry.
Do not leave a candidate to die merely to protect your reputation as a severe teacher. If your instruction was inadequate, their death will not improve it.

## The Returned Account
Let the candidate speak before you give your judgment. Ask what they measured, what burden they accepted, how the quarry became aware of the pursuit, and where their intentions differed from their actions.
Examine the trophy, but do not allow it to answer every question. A successful kill can conceal poor judgment. An empty return can contain an honest and difficult decision.
Where the candidate kept the oath and took permitted quarry that met the Measure, acknowledge what they have earned. Do not withhold recognition to keep a capable hunter dependent upon you.
Where the oath was knowingly broken, refuse the claim. Record your own failures of instruction as faithfully as you record the candidate's failure to keep their word.

## Correction
Correct the fault that occurred. Poor observation requires further observation. Careless handling requires work at the bench. Reckless promises require the candidate to learn the limits they have ignored.
Humiliation alone teaches little beyond concealment. A pupil who fears admitting a mistake may carry that mistake into the next Hunt, where neither of you can easily repair it.
Households differ in their teaching. Those differences do not relieve a sponsor of the need to explain a judgment or hear another witness. If you cannot answer a challenge without invoking your seniority, consider whether your answer is sufficient.

## Passing the Obligation
If injury, duty, or estrangement prevents you from continuing, bring the matter before the household senior and arrange another sponsor. Speak plainly of what the candidate has learned, what remains uncertain, and what promises are still outstanding.
Until the obligation is accepted by another, do not assume it has passed from you. A candidate must not discover, at the moment they need instruction, that each elder believed them to be another's concern.
When the candidate stands as a hunter in their own right, allow them to stand. Their later choices will not always resemble yours. You were charged with teaching judgment, and must expect them to exercise it.
Your name will remain in their account. See that it belongs there.$document$),

('DOC-TJAUKE-COMMON-FIRE', 'At the Common Fire', 'Clan life', 1,
$abstract$An account kept by a hunter received into a new household, concerning shared meals, borrowed tools and the telling of a failed Hunt. Copied for others arriving without kin aboard.$abstract$,
$document$## On My Arrival
They gave me a sleeping place and showed me where to leave my weapons. No one explained the evening meal. I stood at the edge of the compartment until an older hunter asked whether I intended to guard the doorway all night.
He moved his equipment from the bench. That was my welcome.
I had expected more questions about my bloodline. Those came later. The first questions concerned the damaged fastening on my shoulder and whether I had brought the correct tools to repair it.

## The Meal
The common fire was a shallow cooking hearth. A guard kept loose straps from reaching the heat. Someone had marked one side of the grate for food that needed longer, and someone else ignored the marks whenever the cook turned away.
Hunters came in with work still on their hands. An armorer set a disassembled weapon beside his bowl until the cook made him move it. A scout ate standing because she had to relieve another at watch. Two young hunters argued over a tracking exercise neither had completed.
There was room for argument. There was less patience for blocking the food, wasting it, or leaving your bowl for someone else to clean.
I sat beside a hunter from another household. He asked who had taught me to bind a spear haft. When I told him, he knew the method but not the teacher. He showed me where mine would loosen. I showed him the extra turn beneath the binding. He inspected it, grunted, and passed the food.

## An Empty Return
Later, a hunter came in without the trophy several of the others had expected. Someone asked whether the quarry had kept it.
He answered that the quarry had kept everything. There was laughter, including his own. Then he said he had lost the trail at a flooded crossing.
The questions changed. Which bank? How high had the water risen? Had he crossed before the rain or after it? One hunter drew the bend of the river in a spill beside his bowl. Another said the place had changed since his last visit.
No judgment was made over the meal. His witness had not yet returned. He was told to keep his account for the proper hearing. The questions about the river continued because two others intended to use the same route.
He ate. Before leaving, he asked the scout to look at his map.

## What I Learned to Ask
For several evenings I tried to offer something impressive whenever the talk reached me. I was more useful when I admitted that I did not understand the vessel's repair marks.
That admission cost me two afternoons sorting fittings beside the armorer. It also meant I knew whose door to approach when my fastening broke again.
Ask before borrowing a tool. Return it to the hand that lent it, not merely to the place where you found it. If you owe work, agree on the work while both of you remember why it is owed. Do not assume an invitation to eat is an invitation to touch another hunter's equipment.
These were the habits aboard that vessel. Another hearth will have its own. Listen long enough to learn which complaints are jokes and which have been repeated because no one has put the matter right.

## For the Next Arrival
Bring your own account. You need not have taken a great trophy to have seen something worth hearing.
On my last evening before departure, the older hunter asked me to move my equipment. Someone new was standing in the doorway. I made room.$document$),

('DOC-TJAUKE-HOUSEHOLD-REPUTATIONS', 'What Each Household Gets Wrong About Us', 'Clan life', 2,
$abstract$Six household replies collected after an argument over training and hunting practice. The speakers describe what their neighbours misunderstand; their answers are testimony, not declarations on behalf of every member.$abstract$,
$document$## The Replies
The argument began over a candidate's restrictions and ended with six hunters explaining why everyone else had misunderstood their households. They were asked afterward to repeat the useful parts. The replies below retain their disagreements.

## Vek'ta
You remember the refusals. You do not remember how often we tell a hunter to promise less before leaving.
There is nothing difficult about demanding a reckless oath from someone younger. You will not be the one trying to keep it with a broken hand. I would rather hear a modest restriction spoken clearly than spend a whole return hearing what a grander promise was supposed to mean.
Once the words are given, I will ask what was done. That is the part you call unforgiving. You are welcome to argue with the answer. Bring the witness.
And stop sending every quiet candidate to us. Silence tells me very little about whether someone listens.

## Khe'rat
A seal does not keep an oath for you. It shows when you have chosen to break one.
We lock a forbidden system because a hunter should not be reaching for the wrong control out of habit. Removing the temptation is preparation. It does not diminish the restraint any more than sharpening a blade diminishes the kill.
Some of us prefer old equipment. Some cannot leave a sound mechanism alone. We argue about that more often than outsiders imagine. What we agree on is that you must understand the thing you carry.
If you return a borrowed weapon damaged, tell its maker how. I can repair a cracked housing. I cannot repair your account by guessing where you struck it.

## Sa'rahn
Watching is work. We are not waiting for courage to arrive.
A quarry may behave differently when alone, when followed, and when others depend upon it. If you have observed only one of those, say which one. Do not claim to know the whole creature because it fought well for a few breaths.
Yes, observation can become an excuse. I have known scouts who kept finding reasons to wait because choosing meant they might be wrong. A teacher should recognise that too.
The route home deserves the same attention as the route in. Several hunters who mock our maps are alive because they carried one.

## Taal'vek
You think patience means lowering the trial until the candidate passes.
I have sent candidates back to the same exercise until they hated the sight of me. The difficulty was seldom making them suffer. It was making them notice what they kept doing incorrectly.
A hunter who returns after admitting a poor choice can be taught. One who learns to hide every failure from the sponsor becomes dangerous to everyone travelling with them.
We do not all teach alike. Ask three of us when to intervene and you will hear an argument. Ask whether intervention should disappear from the account and the argument will be shorter.

## Orh'kesh
You remember the times we ended a Hunt. You forget the work that let it begin without putting the vessel at risk.
Wounds change. So do infections, damaged restraints and frightened animals. If the circumstances have changed, someone has to say so while there is still time to act.
You may dispute my conclusion. Show me what I failed to observe. Do not tell me that the wound must be harmless because the hunter who received it is respected.
Some of us are hunters first and some would rather have another day to examine what was brought back. Both have reason to object when a specimen reaches the hold in a leaking container.

## Dra'khal
We know the difference between a Hunt and a boarding action. We ask that you remember it before the boarding action begins.
When others depend upon you to hold a passage, they must know what equipment you will use. A private restriction they have never heard can become their burden without their consent.
That does not mean every disagreement calls for weapons. Maintaining a watch, checking a hatch and relieving an exhausted companion are ordinary work. Most of it earns no trophy.
We have hunters who accept severe burdens when the choice concerns their own Hunt. We also have those who boast too readily about what they would do in battle. We would prefer that you judged either by what they actually do.

## What Was Left Unsettled
No one withdrew the original criticism of the candidate's oath. They agreed to hear the candidate before arguing further.
The replies were kept because they explain the argument better than a list of household virtues would. A hunter may recognise their upbringing in one of them and still disagree with its speaker.$document$),

('DOC-TJAUKE-UNFINISHED-PROMISE', 'An Unfinished Promise', 'Accounts and correspondence', 3,
$abstract$A departing hunter's message, a witness's correction and an unresolved recovery request concerning an abandoned shelter. The record preserves uncertainty about the missing companion and leaves acceptance of the return journey open.$abstract$,
$document$## The Message Left Before Departure
The lower shelter is still marked on my route record. Use the copy with the watercourse corrected. The older copy puts the approach beneath the broken face of the ridge.
I left my companion there when the leg would no longer bear weight. The wound had been bound, the bleeding had slowed, and there was enough water for the interval I expected to be gone. I said I would return with a carrier before the next watch ended.
The ridge failed before I reached the landing place. I could not cross back. Those who recovered me found me below the eastern slope, without my pack and unable to stand.
I am fit to travel now. I have asked for passage to the region again. I have not asked anyone to declare my companion dead.

## What I Owe
There was no Hunt left to finish when I made the promise. We had already abandoned the pursuit. Whatever is required to reach the shelter is recovery work, and any hunter accompanying me should understand that before departure.
If my companion is alive, the first purpose is to bring them out. If there are remains, they are to be recovered if that can be done without leaving another hunter beside them. Equipment can wait until the living are accounted for.
The route record includes a narrow opening above the shelter. I could not reach it from below with the carrier we had. Someone travelling unburdened might have reached it. That possibility is why I will search beyond the shelter even if I find it empty.
I left a spare blade within reach and my own water vessel beside the bedding. Neither belonged among the items returned with my pack. If either has changed hands, I want the place and the account of the exchange before I want an accusation.

## The Witness's Correction
I recovered the hunter who left this message. I did not see the shelter or the injured companion.
I can confirm the condition of the eastern slope. I cannot confirm when it fell. The route recording was damaged, and its last intact image shows the approach before the separation.
The departing hunter says the water was sufficient for the promised interval. That is an estimate, not a witnessed inventory. It should remain in the record as such.
I have agreed to examine the route copy before the next departure. I have not agreed that the original decision to leave was sound. That question is still open.

## The Reply
Keep the correction with my message. I remembered two filled vessels until my pack was returned. One was still inside it.
I do not know whether I left enough. I know what I told my companion, and I know I did not return when I said I would.
Do not ask a younger hunter to accept the journey because they owe me instruction or equipment. I need someone who can judge the ridge, someone who can assess the wound if we find the wounded alive, and a second account that is not mine.
If no one accepts before passage becomes available, record that plainly. Do not put names beside the request on the strength of a conversation at a meal.

## The Open Record
No recovery account accompanies these messages. The injured companion's fate remains unconfirmed. No trophy claim is attached to the journey.
Anyone accepting a part in the return is to have their name and undertaking added before departure. Anyone bringing an account of the shelter, the water vessel or the spare blade is to be heard, including those whose account contradicts the messages above.$document$);

CREATE TEMP TABLE roleplay_terms (
  id text PRIMARY KEY, name text NOT NULL, meaning text NOT NULL,
  usage text NOT NULL, doc text NOT NULL REFERENCES roleplay_documents(id)
) ON COMMIT DROP;

INSERT INTO roleplay_terms VALUES
('GLS-TJAUKE-SPONSORS-CHARGE', 'Sponsor''s charge',
 'The responsibility accepted when a hunter undertakes a candidate''s instruction and speaks for their readiness.',
 'Used in Obligations of a Sponsor. Includes preparation, honest testimony and acknowledging the sponsor''s own errors; it does not confer ownership of the candidate''s claims.',
 'DOC-74aebe45-48cc-425d-972f-09cbbecf1d0d'),
('GLS-TJAUKE-TRANSFER-SPONSORSHIP', 'Transfer of sponsorship',
 'The acknowledged passing of a candidate''s instruction from one sponsor to another.',
 'The departing sponsor explains completed teaching, unresolved difficulties and outstanding promises. The obligation does not pass merely because the first sponsor leaves.',
 'DOC-74aebe45-48cc-425d-972f-09cbbecf1d0d'),
('GLS-TJAUKE-COMMON-FIRE', 'Common fire',
 'The shared cooking hearth and gathering place described in At the Common Fire.',
 'A place for meals, practical exchanges and informal accounts. The narrator describes one vessel''s habits, not a compulsory arrangement for every household.',
 'DOC-TJAUKE-COMMON-FIRE'),
('GLS-TJAUKE-EMPTY-RETURN', 'Empty return',
 'A return from a Hunt without the expected trophy.',
 'Describes the outcome rather than its judgment. Loss of the trail, withdrawal, interference and misconduct require different accounts; the absence of a trophy alone does not settle which occurred.',
 'DOC-TJAUKE-COMMON-FIRE'),
('GLS-TJAUKE-HOUSEHOLD-REPUTATION', 'Household reputation',
 'The expectations and assumptions attached to a household by other hunters.',
 'The six replies distinguish reputation from the conduct of individual members. A household''s association with a craft or teaching does not oblige every member to share it.',
 'DOC-TJAUKE-HOUSEHOLD-REPUTATIONS'),
('GLS-TJAUKE-HOUSEHOLD-PRACTICE', 'Household practice',
 'A method of teaching, preparation or daily work followed within a household.',
 'Practice may differ between teachers and vessels. The collected replies are individual testimony, not six new bodies of clan law.',
 'DOC-TJAUKE-HOUSEHOLD-REPUTATIONS'),
('GLS-TJAUKE-UNFINISHED-PROMISE', 'Unfinished promise',
 'An undertaking whose promised act remains unfulfilled and whose account remains open.',
 'In the correspondence, the promise concerns returning for an injured companion. Accepting help does not erase the original undertaking, and offering advice does not itself enlist a helper.',
 'DOC-TJAUKE-UNFINISHED-PROMISE'),
('GLS-TJAUKE-RECOVERY-ACCOUNT', 'Recovery account',
 'A witnessed record of a search for missing hunters and the recovery of living companions, remains or equipment.',
 'Records what was found and what remains uncertain. Recovery work does not establish a trophy claim or settle disputed decisions made before the search.',
 'DOC-TJAUKE-UNFINISHED-PROMISE');

DO $apply$
DECLARE base_order numeric; conflict_name text;
BEGIN
  PERFORM 1 FROM public.library
    WHERE id = 'DOC-74aebe45-48cc-425d-972f-09cbbecf1d0d' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sponsor document DOC-74aebe45-48cc-425d-972f-09cbbecf1d0d was not found. Nothing saved.';
  END IF;

  -- Stop rather than duplicate an existing title/term or move an existing glossary link.
  SELECT d.name INTO conflict_name FROM public.library d
    JOIN roleplay_documents s ON lower(trim(d.name)) = lower(trim(s.name)) AND d.id <> s.id LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'Document "%" already exists with a different ID. Nothing saved.', conflict_name; END IF;
  SELECT g.name INTO conflict_name FROM public.glossary g
    JOIN roleplay_terms s ON lower(translate(trim(g.name), '’‘', $$''$$)) = lower(trim(s.name)) AND g.id <> s.id LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'Glossary term "%" already exists with a different ID. Nothing saved.', conflict_name; END IF;
  SELECT g.name INTO conflict_name FROM public.glossary g
    JOIN roleplay_terms s ON g.id = s.id WHERE g.doc IS DISTINCT FROM s.doc LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'Glossary term "%" has another document link. Nothing saved.', conflict_name; END IF;

  SELECT coalesce(max("order"), 0) INTO base_order FROM public.library;
  INSERT INTO public.library AS existing (id, name, category, "order", summary, body, published, archived)
    SELECT id, name, category, base_order + sequence, summary, body, true, false FROM roleplay_documents
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, summary = EXCLUDED.summary, body = EXCLUDED.body
    WHERE (existing.name, existing.summary, existing.body) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.summary, EXCLUDED.body);

  -- Provisional marks these as newly authored clan terms, not canonical language translations.
  INSERT INTO public.glossary AS existing (id, name, meaning, status, category, usage, doc, published, archived)
    SELECT s.id, s.name, s.meaning, 'Provisional', 'Clan customs', s.usage, s.doc,
      d.published AND NOT d.archived, false
    FROM roleplay_terms s JOIN public.library d ON d.id = s.doc
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, meaning = EXCLUDED.meaning, usage = EXCLUDED.usage
    WHERE (existing.name, existing.meaning, existing.usage) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.meaning, EXCLUDED.usage);
END;
$apply$;

-- Four rows, with two related glossary terms per document.
SELECT d.id, d.name, d.category AS shelf, d.published, d.archived, d.summary AS abstract,
  array_agg(g.name ORDER BY g.name) FILTER (WHERE g.id IS NOT NULL) AS related_glossary
FROM public.library d JOIN roleplay_documents s ON s.id = d.id
LEFT JOIN public.glossary g ON g.doc = d.id
GROUP BY d.id ORDER BY d."order", d.name;
COMMIT;
