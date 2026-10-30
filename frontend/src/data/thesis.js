// The master's thesis, as shown on /projects/thesis. Text is taken from the thesis source
// (~/lingual-hids-thesis: Abstract.tex, Chapter1.tex "Contributions", figure captions);
// the figures are its generated PDFs converted to SVG under public/thesis/. When the
// thesis changes, re-sync from there rather than editing numbers here by hand.

const thesis = {
  title:
    'Lingual-First Host Intrusion Detection: Representation, Controlled Evaluation, and the Limits of Language Modeling on System Provenance',
  degree: 'Master of Science, UMBC, 2026',
  advisor: 'Directed by Dr. Anupam Joshi',

  abstract: [
    'Host intrusion detection asks which recorded events on a host belong to an attack. Since Forrest et al. showed that normal programs emit a stable vocabulary of short system-call sequences, audit data has been treated as a language, and semantic work has mapped security observations to concepts. We ask what a compact symbolic representation of provenance (the record of which processes acted on which files, sockets, and processes) preserves for detection, and what learning adds.',
    'We use DARPA Transparent Computing audit records of hosts attacked by a red team. We serialize each event as a clause of subject, operation, and object, replace the object with a type code (for a file, its location and extension class), and link repeated references to one object by a pointer, keeping the vocabulary small, free of host-specific names, and human-readable. On three hosts from Engagement 3 (April 2018), a training-free frequency table of benign clause counts separates attack from benign entities on CADETS and TRACE (F1 0.885 and 0.843 on the ThreaTrace detector\'s released labels), but only when its counts come from documents those labels mark benign and its threshold is chosen on the test labels; a threshold set on benign data alone gives 0.642 on CADETS. On THEIA it reaches 0.203, because most attack entities are not rare; under the same labels, with benign training data selected by them, our fused detector (a language model of benign entity biographies) ranking the rarest entities\' neighbors raises F1 to 0.987 (0.647 untrained).',
    'On THEIA we count how many of the 118 attack nodes labelled by the authors of ORTHRUS, a published learned detector, appear in a detector\'s first 93 alerts over our reconstruction of its 701,622-node test set; 93 is the ProvFusion detector\'s published operating point (82 attack nodes). Our scores of an entity\'s own clauses, trained or training-free, place at most 17, even when the labels pick between two training-free scores, because type codes cannot say which entities interacted. SENTINEL changes the grammar to restore it: its words are a node\'s (edge type, partner name) relations. It is trained on benign data to predict the edge type of a held-out relation, and scores a node by its most surprising relation seen fewer than twice in training. One model places 42.0 on average over five runs, and averaging five models\' scores places 62; the scoring rule was chosen after inspecting one run, so these results are exploratory. Our reproductions of two published detectors place fewer: ORTHRUS 4 to 7 and Velox 19. In a one-hop variant, SENTINEL\'s context works as well with partner types as with names, but its predicted relations need names, which most attack nodes on CADETS in Engagement 5 lack; the result is specific to THEIA.',
    'The two published THEIA label sets share only 25 of ORTHRUS\'s 118 attack nodes: under ThreaTrace\'s labels our fused detector and MAGIC, a graph autoencoder, statistically tie (F1 0.992 and 0.987 on MAGIC\'s nodes), while under ORTHRUS\'s labels MAGIC ranks 58 of its 66 attack nodes within 1,000 alerts and ours none. A temporal model that predicted benign relations better found fewer attack nodes (25.6 of 118), so held-out likelihood did not pick the detector.',
  ],

  contributions: [
    {
      title: 'What the representation supports, and where learning adds',
      summary:
        'Once the serializer resolves an object\'s identifier and its path to one entity, a training-free frequency table over benign data separates attack from benign entities on CADETS (F1 0.885) and TRACE (0.843). These are best-case numbers: the benign reference is selected with the labels and the threshold is set on the test labels; set from benign data alone it gives 0.642. On THEIA the table reaches only 0.203, because most attack entities are not rare there. A language model of benign entity biographies, fused with rarity around the rarest entities, lifts THEIA to 0.987, against 0.647 for the same model untrained.',
    },
    {
      title: 'Evaluation choices change comparisons',
      summary:
        'I reproduced three published detectors (MAGIC, ORTHRUS, Velox) from their released code. The two published THEIA ground truths share only 25 of ORTHRUS\'s 118 attack nodes. Under ThreaTrace\'s labels my fused detector and MAGIC tie (F1 0.992 vs 0.987); under ORTHRUS\'s labels on the same nodes, MAGIC ranks 58 of 66 attack nodes within 1,000 alerts and mine none. Metrics reorder detectors too: ranking nodes by event count, with no training, scores an attack-detection precision of 0.342, inside the range of five ORTHRUS runs, while placing only 4 of 118 attack nodes in its first 93 alerts.',
    },
    {
      title: 'How far own-clause scores reach',
      summary:
        'On THEIA under ORTHRUS\'s 118 labels, ranking all 701,622 nodes at ProvFusion\'s published budget of 93 alerts, scores that read only an entity\'s own clauses place at most 17, even when the better of two training-free scores is chosen per node type with the test labels. The cause is the representation itself: it records what kind of object a process touched but not which one, so it cannot express which entities interacted.',
    },
    {
      title: 'SENTINEL, a detector over named relations',
      summary:
        'SENTINEL reads up to 32 (edge type, partner name) relations of a node, pools them with one attention layer, is trained on benign data to predict the edge type of a held-out relation, and scores a node by its most surprising relation seen fewer than twice in training. Over five training runs a single model places 42.0 of 118 attack nodes in its first 93 alerts, and averaging the five models places 62, against 4 to 7 for my ORTHRUS reproduction and 19 for Velox. The scoring rule was chosen after inspecting one run, so this part is exploratory. A temporal model with better held-out likelihood found fewer (25.6), so likelihood did not pick the detector.',
    },
  ],

  figures: [
    {
      src: '/thesis/fig15_progression.svg',
      title: 'The argument as a progression of scores',
      caption:
        'Top: a training-free frequency table separates attack from benign entities on CADETS and TRACE but not THEIA, where a trained trajectory model fused with rarity does. Middle: the label set and the metric change which detector looks better. Bottom: at ProvFusion\'s 93-alert operating point under ORTHRUS\'s labels, own-clause scores place at most 17 of 118, and SENTINEL places 42.0 on average over five runs.',
    },
    {
      src: '/thesis/fig16_detectors.svg',
      title: 'Provenance detectors in one notation',
      caption:
        'The detectors the thesis compares with, and its own, in one notation: what each reads, what it learns to predict, and how it scores. In red, what ORTHRUS, Velox, and SENTINEL condition their edge-type prediction on.',
    },
    {
      src: '/thesis/fig17_fused.svg',
      title: 'The fused trajectory detector',
      caption:
        'On THEIA: (a) the rarity core and its one-hop neighbors form the candidate set; (b) the trajectory model scores an entity by the mean surprisal of its own tokens; (c) fusion adds the two percentiles for the core\'s neighbors. F1 under ThreaTrace\'s labels, mean and standard deviation over three runs.',
    },
    {
      src: '/thesis/fig18_collapse.svg',
      title: 'What the serialization discards',
      caption:
        '(a) Entities collapse onto type tokens whose pointer counts objects within one document. (b) Two biographies that both touch the same file token do not say whether it is the same file, so no score of an entity\'s own clauses can use it. (c) SENTINEL reads relations that keep the partner\'s name.',
    },
    {
      src: '/thesis/fig19_sentinel.svg',
      title: 'SENTINEL\'s final detector',
      caption:
        '(a) For a held-out relation of a node, partner names are encoded from word and character trigrams, the node\'s other relations are pooled by one attention layer, and the head predicts the relation\'s edge type. (b) The three changes from the context head, each measured as the mean over five runs at 93 alerts.',
    },
    {
      src: '/thesis/fig20_pivot.svg',
      title: 'SENTINEL with and without relational context',
      caption:
        'Ablation on E3-THEIA (one run): attack nodes among the first 93 of 701,622. Without the node\'s other relations the model finds 2, below the training-free event count\'s 4; with them it finds 0 untrained and 42 trained.',
    },
  ],
};

export default thesis;
