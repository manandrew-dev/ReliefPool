# ReliefPool

## Description
Our project aims to help non-governmental organizations (NGOs) respond quickly
to tsunami-related disasters. We use machine learning to assess tsunami risk
from earthquakes and Solana's high-speed transactions to automatically release
relief funds when the risk exceeds a set threshold.

## Our Inspiration
Natural disasters can happen in minutes, and sometimes financial relief can
take days or even weeks to reach people who need it. We were inspired by this
gap between the speed of a disaster and the speed of response.

## Implementation

### Solana transactions
ReliefPool leverages Solana's high performance network to facilitate fast
speed, low cost transactions. We picked the Anchor framework for Rust's
highly efficient compiled code. Our Anchor service receives a request from
the Oracle service, that is, trigger_payout when the conditions are met,
and after running a rules check to ensure the vault is able to pay out the
balance, fires the function to create the transaction between the vault
wallet populated by donation wallets to admin specified relief group/stakeholder
wallets.

### Oracle
Oracle reads earthquake's magnitude and compares it with the MIN_MAGNITUDE to
determine whether event is sent to the classifier. In an event the classifier
breaks, or could not respond Oracle would return failed and the payout is never
sent. Furthermore, to ensure that no payee recieves the money twice, the Oracle
compares the ID of the earthquake to ensure each one is unique. Lastly, the
Oracle compares the riskScore with the payout threshold to determine whether
the trigger_payout function should be called. If successful, then the
trigger_payout is called, and the event's status is changed to pending and paid
after confirmation.

### Machine Learning Classifier
In our Implementation of the classifier, we used USGS earthquakes dataset for
earthquake magnitude and depth, and NOAA tsunami dataset for longitude, latitude, and
binary target label as our training and testing set. The combination of
these datasets allowed us to use logistic regression as our main model. Our final
model achieved 87% accuracy, 84% recall and ROC-AUC score of 0.97.

## How to run

### Prerequisites
Install:
- Docker
- Docker Compose

No manual installation of the individual dependencies required.

### Start The Application
Clone the repository and enter the project directory.
'''bash
git clone git@github.com:manandrew-dev/ReliefPool.git

cd {directory}
'''

## Features
- Automatic Disaster Relief Payout
- Machine Learning Tsunami Risk Classification
- Real Time Earthquake Monitoring
- On-chain Relief Pool
- Automatic Fund Distribution
- Transparent Contribution and Payouts
- Duplicate Payout Protection
- Fail Safe Oracle
- Historical Earthquake Replay
- Web Dashboard
- Solana Wallet Integration
## Usage
- Create a Relief Pool
- Fund the Pool
- Monitor earthquakes
- Assess Tsunami Risk
- Trigger Relief
- Distribute funds

## What We Learned
We learned how to integrate machine learning, real-time earthquake data,
Solana, and a web application into an end-to-end system. We also gained
experience working with imbalanced datasets, evaluating ML models beyond
accuracy, designing APIs between independent components, and collaborating
under a tight deadline.

## What Challenges You Faced
Our biggest challenges were combining USGS and NOAA data into a reliable
training dataset, handling class imbalance in our classifier, and integrating
the frontend, Oracle, classifier, and Solana program under a tight deadline. We
also had to balance tsunami detection against false alarms when selecting our
payout threshold.

## Visuals



