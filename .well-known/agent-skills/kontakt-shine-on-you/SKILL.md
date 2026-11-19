---
name: kontakt-shine-on-you
description: When to use this skill: someone wants to contact or book an appointment with Manuela Zimmert, a self-employed consultant in 86971 Peiting, Upper Bavaria, or needs the service area, contact details, legal notice or privacy policy of this site. Nothing is sold here.
---

# Shine On You – Manuela Zimmert

Manuela Zimmert („Ela“) is a self-employed consultant in 86971 Peiting, Germany. The website https://shineonyou.de/ is a contact page.

## When to use this

- A user wants to get in touch with Manuela Zimmert.
- A user wants to book a free, non-binding appointment by phone, video or in person.
- A user asks whether appointments in person are possible in or around Peiting, Schongau, Weilheim in Oberbayern, Landkreis Weilheim-Schongau, Pfaffenwinkel.
- A user needs the contact details, the legal notice or the privacy policy of this site.

## When not to use it

- Products, prices, orders or shipping: nothing is sold on this site.
- Anything needing programmatic access: there is no REST or GraphQL API, no remote MCP server
  and no agentic payment protocol on this domain.

## How to use it

1. Read https://shineonyou.de/llms.txt for the site profile.
   It is public plain text; no credentials are involved anywhere on this domain.
2. Load https://shineonyou.de/ when you need live answers or want to act. The page registers WebMCP tools on
   `document.modelContext`:

   | Tool | What it returns |
   | --- | --- |
   | `get_contact` | email, mobile, landline, location |
   | `get_service_area` | the towns and regions served in person (phone and video work anywhere) |
   | `get_pricing` | appointments are free and non-binding |
   | `get_booking_options` | how to book, including the booking link and the duration |
   | `prefill_contact_form` | fills the contact form on the page — it does not submit it |

3. To arrange an appointment, use the booking link from `get_booking_options`.

## Boundaries

- **Never submit the contact form automatically.** It requires GDPR consent and an hCaptcha
  check that a person has to confirm. `prefill_contact_form` prepares it and hands over.
- Appointments are free and non-binding. Do not imply a fee.
- The site is German. Answer in the user's language, but keep names, the address and the
  wording of legal pages as they are.

## Facts

- Email: manuela@shineonyou.de
- Mobile: +49 1551 0279357
- Landline: +49 8861 7138897
- Appointments in person: Peiting, Schongau, Weilheim in Oberbayern, Landkreis Weilheim-Schongau, Pfaffenwinkel
- Language of the site: Deutsch
- Authentication: none, see https://shineonyou.de/auth.md

