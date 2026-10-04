# Tsunami Risk Classifier --- Requirements

ReliefPool • Backend Dev 3 • Codex Implementation Specification

## 1. Purpose

This document is the implementation contract for the tsunami-risk
classifier component of ReliefPool. Codex should use it together with
the existing classifier.py template. The goal is to complete the missing
classifier implementation without changing the public interface expected
by the rest of the project.

## 2. Scope

-   Implement only the machine-learning classifier component.

-   Use Python for the classifier.

-   Complete the existing classifier.py template rather than redesigning
    the project.

-   Preserve all provided function names, parameters, return types,
    constants, and externally used interfaces unless a requirement
    explicitly says otherwise.

-   Do not implement the Solana program, TypeScript oracle, frontend,
    wallet integration, or USGS polling.

-   Do not add unrelated features or refactor unrelated files.

## 3. Classifier Objective

Given earthquake parameters available shortly after detection, produce a
model-derived tsunami risk estimate. The classifier is used by
ReliefPool's oracle as an off-chain signal. The downstream oracle/Solana
components decide whether the score satisfies the pool's payout
threshold.

-   Target task: binary classification --- tsunami-associated event
    vs. non-tsunami event.

-   Preferred output: positive-class probability in \[0, 1\].

-   Risk score: round(probability \* 100), producing an integer in \[0,
    100\].

-   The classifier must not itself trigger or authorize a payout.

## 4. Input Features

Use the exact feature names and shapes required by the provided
classifier.py template and dataset. Do not invent additional predictive
features. Where the template permits these fields, the preferred
live-event features are magnitude, depth, latitude, and longitude
because they can be supplied by the oracle.

If the provided dataset/template requires a feature that cannot be
derived from the supplied project materials, stop and report the missing
dependency instead of silently fabricating values.

## 5. Dataset Requirements

| ID \| Requirement \| Priority \|

| --- \| --- \| --- \|

| DR-1 \| Use the real dataset supplied in the repository or explicitly
  supplied by the team. \| M \|

| DR-2 \| Do not fabricate, synthesize, or manually label training
  examples unless explicitly instructed. \| M \|

| DR-3 \| Identify the actual target column from the supplied
  data/project documentation; do not guess it. \| M \|

| DR-4 \| Validate required feature columns, target column, missing
  values, numeric conversion, and class distribution. \| M \|

| DR-5 \| Do not use information that is only known after the tsunami
  outcome if the model is intended to score an event shortly after
  detection. \| M \|

| DR-6 \| If required dataset details are missing or contradictory,
  report the blocker before changing the intended model semantics. \| M
  \|

## 6. Training Requirements

-   Use scikit-learn unless the provided template explicitly requires
    another library.

-   Prefer a simple tabular classifier appropriate for a 24-hour
    hackathon. Logistic regression and random forest are acceptable
    baselines.

-   Use a reproducible random_state wherever supported.

-   Use a held-out test split; stratify by the target when feasible.

-   Handle preprocessing consistently between training and inference. A
    scikit-learn Pipeline is preferred when preprocessing is required.

-   If classes are substantially imbalanced, use an appropriate
    class-weight strategy or other simple mitigation and document it.

-   Do not optimize for accuracy alone. Positive-class recall is
    important because a false negative represents a tsunami-associated
    event scored as non-tsunami.

## 7. Evaluation Requirements

-   Report accuracy, precision, recall, F1 score, and confusion matrix.

-   Report ROC-AUC when the test set contains both classes and
    probability output is available.

-   Clearly identify which class is treated as the positive tsunami
    class.

-   Do not hardcode, exaggerate, or fabricate evaluation results.

-   If performance is poor, report the actual result rather than
    altering labels or test data to make the model appear better.

## 8. Required Inference Output

The classifier must expose whatever function interface is already
defined in classifier.py. At the integration boundary, the rest of
ReliefPool expects enough information to construct the following logical
result:

``` json
{
  "riskScore": 91,
  "probability": 0.91,
  "modelVersion": "model-v1"
}
```

-   probability must be numeric and in \[0.0, 1.0\].

-   riskScore must be an integer and in \[0, 100\].

-   riskScore = round(probability \* 100).

-   modelVersion must be "model-v1" in inference and health responses.

## 9. Model Persistence

-   If classifier.py/template expects a saved model, serialize the
    fitted model or full preprocessing pipeline with joblib.

-   Do not retrain the model for every prediction.

-   Load the model from the expected project path.

-   Fail clearly if the model artifact is missing or incompatible.

-   Do not commit secrets, virtual environments, caches, or unrelated
    generated files.

## 10. Template Preservation Rules

-   Read classifier.py completely before editing it.

-   Fill TODOs/stubs and missing implementation in place.

-   Do not rename functions that other components may call.

-   Do not change function signatures merely for stylistic reasons.

-   Do not delete comments or scaffolding that documents the expected
    interface unless it is demonstrably obsolete.

-   Avoid splitting classifier.py into additional modules unless the
    existing repository already expects that structure or doing so is
    necessary to satisfy the requirements.

-   Make the smallest coherent set of changes needed for a working
    classifier.

## 11. Error Handling

-   Reject or raise a clear error for missing required predictive
    fields.

-   Reject non-finite numeric values.

-   Validate latitude/longitude bounds if those fields are accepted
    directly: latitude \[-90, 90\], longitude \[-180, 180\].

-   Do not silently replace missing predictive values with arbitrary
    constants unless the fitted preprocessing pipeline explicitly
    defines an imputation strategy.

-   Return/report actionable error messages for missing dataset columns,
    missing model artifacts, and incompatible model inputs.

## 12. Testing Requirements

-   Run any tests already included in the repository.

-   Add focused tests only if needed to verify the completed classifier.

-   Verify that a valid event can be scored without exception.

-   Verify probability is within \[0, 1\] and riskScore is within \[0,
    100\].

-   Verify malformed/missing inputs fail clearly.

-   Where historical demo examples are provided, verify they can pass
    through the same classifier path used by normal events.

## 13. MVP Definition of Done

1.  classifier.py contains no unimplemented required TODOs/stubs.

2.  The training path works against the real supplied dataset.

3.  The trained classifier can score a new earthquake using the expected
    feature interface.

4.  The classifier returns a probability and corresponding 0--100 risk
    score.

5.  Evaluation metrics are produced from a real held-out test set.

6.  Existing relevant tests pass, plus any new classifier tests.

7.  Backend Dev 2 can consume the classifier output without needing to
    understand or modify the ML internals.

## 14. Non-Goals

-   Production-grade tsunami forecasting.

-   Official emergency-warning functionality.

-   Deep learning unless the provided template already requires it.

-   Solana integration.

-   Oracle implementation.

-   Frontend implementation.

-   Continuous model retraining.

-   Perfect predictive performance.

## 15. Safety and Demo Framing

This classifier is a hackathon prototype. Its output is a model-derived
risk score used to demonstrate the ReliefPool pipeline. Do not describe
it in code comments, documentation, or output as an official tsunami
warning or as suitable for real-world emergency decisions.

## 16. Instructions to Codex

``` text
Read this requirements document and the entire existing classifier.py before making changes. Complete the missing implementation in classifier.py according to these requirements. Preserve the existing public function names, signatures, expected inputs/outputs, and project structure. Inspect the supplied dataset and supporting files rather than inventing dataset semantics. Do not modify unrelated components. If a required dataset field, label definition, dependency, or interface detail is genuinely missing or contradictory, stop and report the blocker instead of guessing. After implementation, run the relevant tests/training checks, fix errors caused by your changes, and report what you changed and the actual evaluation results.
```

## 17. Open Items Codex Must Not Guess

-   The actual dataset if none has been supplied.

-   The target/label definition if it is not documented in the data or
    template.

-   Additional model features not present in the supplied contract.

-   The Solana payout threshold.

-   Scientific claims about the model's reliability.
