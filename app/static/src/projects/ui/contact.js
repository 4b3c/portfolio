// The contact form: the cabin's mailbox, and the same form again at the bottom
// of the list, for people who'd rather not walk. You can't walk while the
// mailbox is open, so typing in it doesn't move you.
import { state } from '../state.js';
import { track, visitorId } from '../visits.js';

const contact = document.getElementById('contact');
const contactForm = contact.querySelector('[data-form]');
const contactSent = contact.querySelector('[data-sent]');
const contactStatus = contact.querySelector('[data-status]');
export function openContact() {
  contact.style.display = '';          // not `hidden`: its Tailwind `flex` class would override that
  state.contactOpen = true;
  contactForm.hidden = false;
  contactSent.hidden = true;
  contactStatus.hidden = true;
  contactForm.querySelector('input').focus();
}
function closeContact() {
  contact.style.display = 'none';
  state.contactOpen = false;
  document.activeElement?.blur();      // so the arrow keys go back to walking
}
contact.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeContact));
contact.addEventListener('click', (e) => { if (e.target === contact) closeContact(); });
window.addEventListener('keydown', (e) => { if (state.contactOpen && e.code === 'Escape') closeContact(); });

// Sends a form ([data-form] in `box`) to /contact with fetch, so the page
// stays put, then swaps it for its [data-sent] thank-you. `where` says which
// form it was, in the visit notes (visits.js).
function wire(box, where, onSent) {
  const form = box.querySelector('[data-form]');
  const sent = box.querySelector('[data-sent]');
  const status = box.querySelector('[data-status]');
  const error = (text) => {
    status.textContent = text;
    status.style.color = '#aa3220';
    status.hidden = false;
  };
  form.addEventListener('focusin', () => track('contact', where), { once: true });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const send = form.querySelector('[data-send]');
    send.disabled = true;
    send.textContent = 'sending…';
    const body = new FormData(form);
    body.append('visitor', visitorId());   // so the note is linked to this visit
    try {
      const response = await fetch(form.action, { method: 'POST', body });
      const reply = await response.json().catch(() => ({}));
      if (!response.ok || !reply.ok) {
        error(reply.error || "Couldn't send that. Try again in a bit?");
        return;
      }
      track('sent', where);
      form.reset();
      form.hidden = true;
      sent.hidden = false;
      onSent(sent);
    } catch (err) {
      error("Couldn't reach the mailbox. Check your connection and try again?");
    } finally {
      send.disabled = false;
      send.textContent = 'send';
    }
  });
}
wire(contact, 'mailbox', (sent) => {
  state.mailSent = true;               // raises the flag on the mailbox
  sent.querySelector('[data-close]').focus();
});
wire(document.getElementById('list-contact'), 'list', () => { state.mailSent = true; });
