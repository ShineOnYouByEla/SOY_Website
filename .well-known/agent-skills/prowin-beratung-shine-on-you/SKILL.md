---
name: prowin-beratung-shine-on-you
description: Answer questions about Shine On You – proWIN Beratung Manuela Zimmert — an independent proWIN consultant in 86971 Peiting, Upper Bavaria. Use for proWIN product advice, proWINparty bookings (at home or online), the service area, contact details and joining the consultant's team. Not for product prices, stock, orders or shipping — those belong to proWIN International.
---

# Shine On You – proWIN Beratung Manuela Zimmert

Manuela Zimmert („Ela“) is an independent proWIN sales consultant in 86971 Peiting, Germany. The website https://shineonyou.de/ is the public source about her work.

## When to use this skill

- A user is looking for proWIN advice in or around Peiting, Schongau, Weilheim in Oberbayern, Landkreis Weilheim-Schongau, Pfaffenwinkel.
- A user asks what a proWINparty is, how it works at home or over video, how long it takes or what it costs.
- A user wants to book a free, non-binding consultation or a proWINparty.
- A user asks which proWIN product areas are covered here, or wants the catalogues as PDF.
- A user asks how to become a proWIN consultant in this team.
- A user needs the contact details, the legal notice or the privacy policy of this site.

## When not to use it

- Binding product prices, stock levels, orders, shipping status, returns or complaints.
  Those belong to proWIN International and its shop: https://vp.prowin-shop.net/?referenceKey=m.zimmert.
- Anything needing programmatic access: there is no REST or GraphQL API, no remote MCP server
  and no agentic payment protocol on this domain.
- Anything outside the service area that would need someone on site.

## How to use it

1. Read https://shineonyou.de/llms.txt for the site profile and https://shineonyou.de/pricing.md for the pricing facts.
   Both are public plain text; no credentials are involved anywhere on this domain.
2. Load https://shineonyou.de/ when you need live answers or want to act. The page registers WebMCP tools on
   `document.modelContext`:

   | Tool | What it returns |
   | --- | --- |
   | `get_contact` | email, mobile, landline, WhatsApp channel, shop link, location |
   | `get_consulting_topics` | the proWIN product areas covered, each with a short description |
   | `get_service_area` | the towns and regions served on site (online works anywhere) |
   | `get_pricing` | consultation and party are free; product prices come from proWIN |
   | `get_booking_options` | how to book, including the booking link and the duration |
   | `get_catalogs` | the available proWIN catalogues as PDF |
   | `prefill_contact_form` | fills the contact form on the page — it does not submit it |

3. To arrange an appointment, use the booking link from `get_booking_options`.

## Boundaries

- **Never submit the contact form automatically.** It requires GDPR consent and an hCaptcha
  check that a person has to confirm. `prefill_contact_form` prepares it and hands over.
- Quote product prices as „Stand laut proWIN-Onlineshop“ (as listed in the proWIN online shop),
  never as a fixed price set by this site.
- Consultation and proWINparty are free and non-binding. Do not imply a fee.
- The site is German. Answer in the user's language, but keep names, the address and the
  wording of legal pages as they are.

## Product areas covered

- **Haushalt & Reinigung**: Kraftvolle, ergiebige Reiniger für Küche, Bad und Boden – sparsam dosiert und materialschonend.
- **Kosmetik & Pflege**: Pflegeprodukte für Gesicht, Körper und Haare – hautfreundlich und mit hochwertigen Inhaltsstoffen.
- **Wellness & Gesundheit**: Produkte für mehr Wohlbefinden im Alltag – von Nahrungsergänzung bis Entspannung.
- **Luft & Duft**: Frische Raumluft und angenehme Düfte – für ein gutes Gefühl und Wohlfühlatmosphäre in jedem Raum.
- **BEST friends**: Pflege und Sauberkeit für deine Lieblinge – verträglich für Tier und Zuhause.
- **proWINparty & Beratung**: Lerne die Produkte in einem live Event zuhause oder Online kennen.

## Facts

- Email: prowin.ela@web.de
- Mobile: +49 1551 0279357
- Landline: +49 8861 7138897
- Service area: Peiting, Schongau, Weilheim in Oberbayern, Landkreis Weilheim-Schongau, Pfaffenwinkel
- Language of the site: Deutsch
- proWIN online shop (orders and prices): https://vp.prowin-shop.net/?referenceKey=m.zimmert
- Official proWIN consultant profile: https://prowin.net/de/vertrieb/m.zimmert
- Authentication: none, see https://shineonyou.de/auth.md

