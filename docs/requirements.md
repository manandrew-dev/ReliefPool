# ReliefPool: Requirements
 
> "ReliefPool" is a working name. Rename freely.
 
| | |
|---|---|
| **Team** | Andrew, Keith, Khan, Alice |
| **Tracks** | MLH Best Use of Solana (primary), Enactus SFU UNSDG (secondary) |
| **Build window** | 24 hours |
| **Status** | Draft v0.3 |
 
## 1. Overview
 
### 1.1 Problem
 
After a disaster, relief money often takes days or weeks to reach local responders. Funds are held by individual organizations, release depends on manual approval, and contributors have limited visibility into where their money went.
 
### 1.2 Solution
 
ReliefPool is a parametric relief fund for tsunami-prone coastal regions. Partner organizations pre-fund a shared on-chain pool and agree in advance on who receives the money and under what conditions. When an earthquake occurs and a tsunami risk classifier scores it above the agreed threshold, the pool pays local responders automatically, in seconds.
 
### 1.3 Goals
 
- **G1:** Demonstrate an end-to-end payout on Solana devnet triggered by earthquake data.
- **G2:** Make Solana load-bearing: the escrow, the payout rules, and the contribution record all live on-chain.
- **G3:** Show a clear fit with SDG 17 through pooled, multi-partner funding with shared and visible rules.
## 2. Scope
 
### 2.1 In scope
 
- One Solana program (Anchor) that holds pooled funds and enforces payout rules
- An oracle service that reads USGS earthquake data, scores it with the classifier, and triggers payouts
- A web dashboard for contributing to a pool and viewing its state and history
- A baseline tsunami risk classifier trained during the event, with a rule-based scorer as a fallback
- A demo mode that replays a historical earthquake
### 2.2 Out of scope
 
- Mainnet deployment or real money
- Stablecoin (SPL token) support; the build uses native SOL on devnet
- Converting funds to local currency (off-ramps)
- Identity verification of partners or responders
- Decentralized or multi-party oracles (stretch only)
- A validated or production-grade risk model; the classifier is a baseline only
## 3. Stakeholders
 
| Stakeholder | Type | Role | What they need |
|---|---|---|---|
| Contributing partners (NGOs, donors, local government) | Primary user | Fund the pool | Proof their money is held under agreed rules and reaches the agreed recipients |
| Local responders (relief organizations in the region) | Primary user | Receive payouts | Fast access to funds after an event, with no approval delay |
| Pool admin | Primary user | Creates the pool, registers responders | A simple way to set the region, threshold, and payout shares |
| Affected communities | Indirect beneficiary | Served by responders | Relief that arrives sooner |
| Oracle operator (the team) | System operator | Runs the feed, classifier, and trigger | Reliable event data and a working signing key |
| MLH judges | Evaluator | Judge the Solana track | Meaningful, working use of Solana |
| Enactus SFU judges | Evaluator | Judge the UNSDG track | Clear SDG impact, especially Goal 17 |
| USGS | External data provider | Supplies earthquake data | None (public feed) |
 
## 4. User stories
 
- **US-1:** As a pool admin, I want to create a pool for a region with a risk threshold, so that partners have a clear rule to fund against.
- **US-2:** As a pool admin, I want to register responders and their payout shares, so that the split is agreed before any event.
- **US-3:** As a contributing partner, I want to deposit funds into the pool from my wallet, so that my contribution is locked under the pool's rules.
- **US-4:** As a contributing partner, I want to see every contribution and payout, so that I can verify how funds were used.
- **US-5:** As a responder, I want to receive my share automatically when an event triggers, so that I can act without waiting for approval.
- **US-6:** As any visitor, I want to see recent earthquakes and their risk scores, so that I understand why a payout did or did not happen.
- **US-7:** As a presenter, I want to replay a historical earthquake, so that I can demonstrate a payout on demand.
## 5. Functional requirements
 
Priority: **M** = must have, **S** = should have, **C** = could have (stretch).
 
### 5.1 Pool management (on-chain)
 
| ID | Requirement | Priority |
|---|---|---|
| FR-1 | The program shall let an admin initialize a pool with a region identifier, a risk threshold, an oracle public key, and an admin public key. | M |
| FR-2 | The program shall let only the pool admin register a responder with a wallet address and a payout share. | M |
| FR-3 | The program shall reject a payout unless the registered shares total 100%. | M |
| FR-4 | The program shall limit a pool to a fixed maximum number of responders (5). | M |
| FR-5 | The program shall let the admin set a maximum payout per event at initialization. | S |
 
### 5.2 Contributions (on-chain)
 
| ID | Requirement | Priority |
|---|---|---|
| FR-6 | The program shall let any wallet contribute SOL to the pool's vault. | M |
| FR-7 | The program shall record each contributor's cumulative contribution. | M |
| FR-8 | The program shall track the pool's total contributions and total paid out. | M |
| FR-9 | The program shall let contributors reclaim funds if the pool expires without a payout. | C |
 
### 5.3 Event ingestion and risk scoring (off-chain)
 
| ID | Requirement | Priority |
|---|---|---|
| FR-10 | The oracle service shall poll the USGS GeoJSON earthquake feed at a regular interval. | M |
| FR-11 | The oracle service shall discard events outside the pool's region. | M |
| FR-12 | The oracle service shall pass each in-region event to the classifier and obtain a tsunami risk score. | M |
| FR-13 | The oracle service shall expose recent events and their scores to the dashboard. | M |
| FR-14 | The oracle service shall not submit the same event more than once. | S |
| FR-32 | The classifier service shall provide a rule-based scorer (magnitude, depth, location) behind the scoring endpoint, so the rest of the system can be built before a model exists. | M |
| FR-33 | The classifier service shall score events with a baseline model trained on historical earthquake data, using only features available at the time of the event. | S |
 
### 5.4 Payout trigger (on-chain)
 
| ID | Requirement | Priority |
|---|---|---|
| FR-15 | The oracle service shall submit a payout transaction when an event's risk score meets or exceeds the pool's threshold. | M |
| FR-16 | The program shall accept a payout instruction only when signed by the pool's registered oracle key. | M |
| FR-17 | The program shall reject a payout whose risk score is below the pool's threshold. | M |
| FR-18 | The program shall reject a payout for an event ID that has already been paid. | M |
| FR-19 | The program shall split the payout among responders according to their registered shares. | M |
| FR-20 | The program shall record the event ID, risk score, and amount of each payout. | M |
| FR-21 | The program shall scale the payout amount with the risk score (tiered payouts). | C |
| FR-22 | The program shall require agreement from more than one oracle before paying out. | C |
 
### 5.5 Dashboard
 
| ID | Requirement | Priority |
|---|---|---|
| FR-23 | The dashboard shall let a user connect a Solana wallet on devnet. | M |
| FR-24 | The dashboard shall show the pool's balance, region, threshold, and registered responders with their shares. | M |
| FR-25 | The dashboard shall let a connected user contribute to the pool. | M |
| FR-26 | The dashboard shall list contributions by contributor. | M |
| FR-27 | The dashboard shall show a feed of recent events with their risk scores and whether each triggered a payout. | M |
| FR-28 | The dashboard shall list payouts with a link to each transaction on a Solana explorer. | M |
| FR-29 | The dashboard shall show events and the pool's region on a map. | C |
 
### 5.6 Demo mode
 
| ID | Requirement | Priority |
|---|---|---|
| FR-30 | The oracle service shall accept a replayed historical earthquake and process it exactly as it would a live event. | M |
| FR-31 | The dashboard shall provide a control to start a replay. | S |
 
## 6. Non-functional requirements
 
| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Performance | A triggered payout shall be confirmed on devnet within 5 seconds of the oracle submitting it. |
| NFR-2 | Performance | A new in-region event shall appear on the dashboard within 60 seconds of appearing in the USGS feed. |
| NFR-3 | Security | Funds shall be held in a program-owned account that no individual wallet, including the admin's, can withdraw from directly. |
| NFR-4 | Security | The oracle's private key shall not be committed to the repository or exposed to the frontend. |
| NFR-5 | Integrity | A single event shall never cause more than one payout from the same pool. |
| NFR-6 | Transparency | Every contribution and payout shall be verifiable on a public Solana explorer. |
| NFR-7 | Reliability | A failure of the USGS feed or the classifier shall not cause a payout. |
| NFR-8 | Usability | A first-time user with a devnet wallet shall be able to contribute in three clicks or fewer after connecting. |
| NFR-9 | Cost | Transaction fees for a payout shall be negligible relative to the payout (under 0.01 SOL). |
| NFR-10 | Maintainability | The repository shall include a README with setup steps that let a judge run the project locally. |
 
## 7. Constraints
 
- **Time:** 24 hours, team of four.
- **Network:** Solana devnet only.
- **Currency:** Native SOL. The vault must always keep enough SOL to stay rent-exempt, so a payout can never empty it completely.
- **On-chain numbers:** Risk scores and thresholds are stored as integers (for example 0 to 100), and shares as basis points, because on-chain programs should avoid floating point.
- **Framework:** The program is written in Rust with Anchor.
- **Classifier:** Runs off-chain in Python and is called over a local HTTP API.
- **Oracle:** A single oracle operated by the team. This is a known centralization point and will be stated in the pitch.
## 8. Assumptions and dependencies
 
**Assumptions**
 
- A usable baseline classifier can be trained during the event from the fields the USGS feed provides (magnitude, depth, location).
- Judges will accept a devnet demo with a replayed historical event.
- Responders already have Solana wallets.
**Dependencies**
 
- USGS earthquake GeoJSON feed
- Solana devnet and a devnet faucet for test SOL
- Anchor, the Solana wallet adapter, and a browser wallet such as Phantom
- Historical earthquake data with tsunami labels (the USGS catalog or the data mining project's dataset)
## 9. On-chain data
 
| Account | Holds |
|---|---|
| Pool | Admin key, oracle key, region ID, risk threshold, per-event payout cap, responder list with shares, total contributed, total paid out |
| Vault | The pooled SOL, owned by the program |
| Contribution | One per contributor per pool: contributor key and cumulative amount |
| Payout record | One per paid event: event ID, risk score, amount, timestamp. Its existence is what blocks a second payout for the same event. |
 
## 10. Risks
 
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rust and Anchor learning curve stalls the program | High | High | Start from an existing escrow example; one person on it from hour one; if not on devnet by the halfway mark, hardcode responders and drop FR-5 |
| Classifier is not trained in time or performs poorly | Medium | Medium | Build the rule-based scorer (FR-32) in the first hour behind the same endpoint; timebox training to about three hours; keep the scorer as the fallback |
| No qualifying live earthquake during the demo | Near certain | High | Demo mode (FR-30) is a must-have |
| Devnet faucet limits or devnet outage | Medium | Medium | Fund wallets early; record a backup video of a working run |
| Integration between the three components runs late | Medium | High | Agree on instruction names, arguments, and the event JSON shape in the first hour; build against mocks |
| Judges challenge the single oracle | High | Low | Acknowledge it up front and describe the multi-oracle design (FR-22) |
 
## 11. Acceptance criteria
 
The project is demo-ready when this scenario runs end to end on devnet:
 
1. A pool exists for a coastal region with a threshold and at least two registered responders.
2. Three different wallets contribute, and the dashboard shows each contribution and the updated balance.
3. A low-risk event is processed, its score appears on the dashboard, and no payout occurs.
4. A replayed high-risk event is processed and its score meets the threshold.
5. A payout confirms within 5 seconds, and each responder's balance increases by its share.
6. The payout appears on the dashboard with a working explorer link.
7. Replaying the same event again does not produce a second payout.
## 12. SDG alignment
 
| Goal | Target | How ReliefPool contributes |
|---|---|---|
| 17: Partnerships for the Goals | 17.3 | Mobilizes funds from multiple sources into one pool |
| 17: Partnerships for the Goals | 17.16, 17.17 | Public, private, and civil-society partners fund and govern relief under shared, visible rules |
| 11: Sustainable Cities and Communities | 11.5 | Reduces losses from disasters by getting funds to responders faster |
| 13: Climate Action | 13.1 | Strengthens resilience and capacity to respond to natural disasters |
 
## 13. Open questions
 
- ~~Which region does the demo pool cover?~~ Resolved: **Japan Pacific Coast**, `region_id = 1`, latitude 30 to 46 and longitude 135 to 150. The oracle filters live events to this box, and all demo scenarios fall inside it.
- ~~What threshold value makes sense given the classifier's output range?~~ Resolved: **70**. See "Threshold decision" below.
- Does an MVP payout release the per-event cap or the whole vault (less the rent-exempt minimum)? Open; the program owner decides. The oracle reads the actual amount from `PayoutRecord.amount`, so it works either way.
- ~~Who owns each component?~~ Resolved: Andrew (frontend), Alice (Solana program and setup script), Khan (oracle service), Keith (classifier).

### Threshold decision

The demo pool pays out when the classifier's risk score is **70 or higher** (`threshold = 70` in `initialize_pool`).

The value was chosen from the classifier's validation data (`model-v1`, logistic regression on magnitude, depth, latitude, and longitude). It was not tuned to make the demo events land on a particular side. On the held-out test set of 795 events (53 tsunamis):

| Threshold | Tsunamis caught | False alarms | F1 |
|---|---|---|---|
| 50 | 45 / 53 | 96 | 0.46 |
| 60 | 41 / 53 | 71 | 0.50 |
| 65 | 41 / 53 | 59 | 0.54 |
| **70** | **38 / 53** | **46** | **0.55** |
| 75 | 37 / 53 | 41 | 0.56 |
| 80 | 30 / 53 | 32 | 0.52 |
| 90 | 21 / 53 | 20 | 0.45 |

Thresholds from 70 to 80 perform best, and the differences between them are within statistical noise: with only 53 tsunamis in the test set, the 95% range for recall at 70 is roughly 59% to 84%. Choosing the threshold by cross-validation on the training data alone also lands in this range (70 to 90 across folds). Below 70, false alarms rise quickly, which would drain the pool on quakes that cause no tsunami.

We chose 70, the lower end of the range, because for a relief pool a missed tsunami costs more than a false alarm. At 70 the model catches about 72% of tsunami-generating quakes, and about 45% of payouts go to quakes that did generate one.

Known limitation: `model-v1` performs only slightly better than a simple "large and shallow" rule (AUC 0.93 versus 0.92 for magnitude and depth alone). Its value is a calibrated, reproducible score rather than new insight; a non-linear model or plate-boundary features are the natural next step.

The demo events are held out of training, and with `model-v1` they score as follows:

| Event | USGS ID | Score | Outcome at 70 |
|---|---|---|---|
| Hokkaido 2013, M6.9, 107 km deep | `usc000f03a` | 59 | No payout |
| Fukushima 2022, M7.3 | `us6000h519` | 95 | Payout |
| Tōhoku 2011, M9.1 | `official20110311054624120_30` | 100 | Payout |

If the model is retrained, rerun this analysis before changing the threshold. Change it only together with the setup script, since the on-chain value is what the oracle and frontend use.
## 14. Glossary
 
- **Parametric:** A payout triggered by a measurable event crossing a preset threshold, with no claims process.
- **Oracle:** A service that brings off-chain data (here, earthquake risk scores) onto the blockchain.
- **Devnet:** Solana's public test network, where SOL has no real value.
- **Vault:** The program-owned account that holds the pooled funds.
- **Basis point:** One hundredth of a percent; 10,000 basis points is 100%.
- **Rent-exempt minimum:** The small SOL balance an account must hold to stay alive on Solana.
 
