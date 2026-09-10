# Notes for the eligibility-matching side

A running list of things `ticket-scanner` deliberately does **not** handle, because
they're judgment calls that belong to the downstream eligibility-matching service, not
to an OCR/barcode extraction library. Collected here so they can be handed over in one
place once that side of the project starts.

- **Date plausibility is not checked.** `departureDate`/`returnDate` are whatever was
  actually printed on the ticket, with no check against "today" or against each other.
  A ticket whose departure date is in the past (e.g. an old CheapOair confirmation used
  to test this scanner) will come back with that past date rather than being rejected —
  this scanner's job is "what does the document say," not "is this a valid insurance
  purchase." Rejecting/flagging a departure date that's in the past (or too close to
  "now," if there's a minimum lead time for a policy) needs to happen on your side.
