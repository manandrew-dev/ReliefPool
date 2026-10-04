# ReliefPool

## Description
Our project aims to help non-governmental organizations (NGOs) respond quickly
to tsunami-related disasters. We use machine learning to assess tsunami risk
from earthquakes and Solana's high-speed transactions to automatically release
relief funds when the risk exceeds a set threshold.

## Implementation

### Solana transactions

### Oracle
Oracle reads riskScore and compares it with the MIN_MAGNITUDE to determine
whether a payout should be payed. In an event the classifier breaks, or could
not respond Oracle would return failed and the payout is never sent.
Furthermore, to ensure that no payee recieves the money twice, the Oracle
compares the ID of the earthquake to ensure each one is unique. Lastly, once
the Oracle confirms everything is in order, a trigger_payout status is changed.

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

## Usage

## Visuals



