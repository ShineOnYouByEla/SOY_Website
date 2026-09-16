# Agent authentication for Shine On You

Kurz auf Deutsch: Diese Seite hat keine Anmeldung. Alles, was ein Agent hier tun kann,
ist oeffentlich und ohne Zugangsdaten erreichbar. Der Rest dieser Datei sagt das noch
einmal in der Gliederung der auth.md-Spezifikation, damit Agenten nicht weitersuchen.

**There is nothing to authenticate to.** Shine On You – proWIN Beratung Manuela Zimmert is a static informational website.
It has no REST or GraphQL API, no remote MCP server, no user accounts and no payment flow.
Every agent-facing surface listed below is public and anonymous.

## Discover

- Start at https://shineonyou.de/llms.txt — the site profile, including a `When to use this site` section.
- https://shineonyou.de/pricing.md carries the pricing facts, https://shineonyou.de/.well-known/ard.json the machine-readable
  catalog of agentic resources, and https://shineonyou.de/.well-known/agent-skills/index.json the Agent Skills index.
- There is deliberately **no** `/.well-known/oauth-protected-resource` (RFC 9728) and no
  `/.well-known/oauth-authorization-server` (RFC 8414). Publishing either would advertise an
  authorization server that does not exist, and an `agent_auth` block whose `identity_endpoint`
  would resolve to nothing. Absent metadata is a truthful answer; stale metadata is not.
- No endpoint here answers with `401` or a `WWW-Authenticate` header, because no endpoint here
  is protected.

## Pick a method

Only one identity type applies, and it is the one that needs no credentials:

- `anonymous` — supported. Fetch the public documents, run the in-page tools, done.
- `identity_assertion` — not supported. There is no resource server to present an ID-JAG
  (`urn:ietf:params:oauth:token-type:id-jag`) to, so no `assertion_types_supported` is advertised.
- `service_auth` — not supported. No email-verified service identities are issued here.

## Register

Nothing to register. No client registration, no API keys, no `identity_endpoint` to POST to.
An agent may identify itself with a descriptive `User-Agent`; see `robots.txt` for which
crawlers are welcome.

## Claim

No claim ceremony. There are no agent-owned resources on this domain that a human could later
take ownership of, so there is no `claim_endpoint`.

## Exchange

No token exchange. There is no token endpoint, no scopes and no refresh flow.

## Use the access_token

There is no `access_token`. Send plain unauthenticated HTTPS requests:

```http
GET /llms.txt HTTP/1.1
Host: shineonyou.de
Accept: text/plain

(no Authorization header, and none is expected)
```

The interactive surface lives in the page itself: on https://shineonyou.de/ the WebMCP tools are registered on
`document.modelContext` (`get_contact`, `get_consulting_topics`, `get_service_area`,
`get_pricing`, `get_booking_options`, `get_catalogs`, `prefill_contact_form`). An agent that
loads and renders the homepage gets them without any handshake.

## Errors

- `404` means the path does not exist — the 404 page names where to look instead.
- A `403` or a blocked request comes from the crawler policy in `robots.txt`, not from auth.
  Switching identities will not change it.
- One boundary is enforced by policy rather than by a status code: the contact form on the
  homepage requires GDPR consent and an hCaptcha check from a human. `prefill_contact_form`
  fills the fields and stops. Do not submit it on a person's behalf.

## Revocation

Nothing is issued, so nothing is revoked. There is no `events_endpoint` and no revocation feed.

## Contact

- Email: prowin.ela@web.de
- Phone: +49 1551 0279357
- Legal notice: https://shineonyou.de/impressum.html · Privacy policy: https://shineonyou.de/datenschutz.html

Spec this file follows: <https://github.com/workos/auth.md>

