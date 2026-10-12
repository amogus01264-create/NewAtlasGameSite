# Security Specification: Atlas Gaming Network

## Data Invariants
1. Account documents under `/accounts/{username}` must have matching `username` field (lowercase normalized).
2. Users can create an account if it doesn't exist, and update their own gamerpic or status.
3. Friend connections under `/friends/{friendId}` belong to `ownerUsername` and can only be listed/manipulated by participants.
4. Friend requests under `/friendRequests/{requestId}` have valid `fromUser` and `toUser` usernames and must be in valid status transitions ('pending' -> 'accepted' / 'declined').

## Collection Security Rules
- `/accounts/{username}`:
  - Read: Allowed for authenticated sessions so players can look up accounts and view profiles.
  - Create: Allowed if document does not exist and payload meets `isValidUserAccount`.
  - Update: Allowed if password matches or updating non-critical fields.
- `/friends/{friendId}`:
  - Read: Allowed if user is `ownerUsername` or `username`.
  - Create/Update/Delete: Allowed for participating users.
- `/friendRequests/{requestId}`:
  - Read: Allowed for `fromUser` or `toUser`.
  - Create: Allowed for sender.
  - Update/Delete: Allowed for recipient or sender.
