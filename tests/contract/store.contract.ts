import { describe, expect, it } from "vitest";
import type { Appointment, Client, Gap, Offer, Salon, Service, Specialty, Staff } from "@/domain/model";
import type { Store } from "@/ports";

/** Datos mínimos que cada adaptador debe sembrar antes del contrato. */
export interface ContractFixture {
  readonly salon: Salon;
  readonly specialties: readonly Specialty[];
  readonly staff: readonly Staff[];
  readonly services: readonly Service[];
  readonly clients: readonly Client[];
}

export function contractFixture(salonId: string): ContractFixture {
  const day = [{ start: "09:00", end: "19:00" }];
  return {
    salon: { id: salonId, name: "Salón de contrato", timezone: "America/Santo_Domingo", currency: "DOP", slug: salonId, active: true, settings: {} },
    specialties: [{ id: "fade", name: "Fade" }],
    staff: [
      {
        id: `${salonId}-carlos`,
        salonId,
        name: "Carlos",
        aliases: [],
        specialties: ["fade"],
        schedule: [day, day, day, day, day, day, day],
        color: "#2563eb",
        active: true,
      },
    ],
    services: [
      {
        id: `${salonId}-fade`,
        salonId,
        name: "Fade",
        category: "corte",
        durationMinutes: 45,
        bufferMinutes: 0,
        price: 700,
        requiredSpecialties: ["fade"],
        defaultCycleDays: 21,
        keywords: ["fade"],
        active: true,
      },
    ],
    clients: ["a", "b"].map((x, i) => ({
      id: `${salonId}-client-${x}`,
      salonId,
      name: `Cliente ${x}`,
      phone: `+1809555900${i}`,
      optedOut: false,
      createdAt: "2026-09-01T12:00:00.000Z",
    })),
  };
}

/** Contrato que todo `Store` debe cumplir — corre contra memoria y contra Supabase. */
export function runStoreContract(name: string, setup: () => Promise<{ store: Store; fixture: ContractFixture }>): void {
  describe(`Store contract — ${name}`, () => {
    const appt = (f: ContractFixture, id: string, start: string, end: string, clientIndex = 0): Appointment => ({
      id,
      salonId: f.salon.id,
      clientId: f.clients[clientIndex]!.id,
      staffId: f.staff[0]!.id,
      serviceId: f.services[0]!.id,
      start,
      end,
      status: "booked",
      source: "whatsapp",
      price: 700,
      createdAt: "2026-09-30T12:00:00.000Z",
    });

    it("lee catálogo y busca clientes por teléfono", async () => {
      const { store, fixture } = await setup();
      expect((await store.salon.get()).name).toBe(fixture.salon.name);
      expect(await store.staff.list()).toHaveLength(1);
      expect((await store.services.list())[0]!.price).toBe(700);
      expect((await store.clients.findByPhone(fixture.clients[1]!.phone))?.id).toBe(fixture.clients[1]!.id);
      expect(await store.clients.findByPhone("+18090000000")).toBeUndefined();
    });

    it("insertIfFree rechaza citas solapadas del mismo estilista", async () => {
      const { store, fixture } = await setup();
      const p = fixture.salon.id;
      const first = await store.appointments.insertIfFree(appt(fixture, `${p}-a1`, "2026-10-03T14:00:00.000Z", "2026-10-03T14:45:00.000Z"));
      expect(first.ok).toBe(true);
      const clash = await store.appointments.insertIfFree(appt(fixture, `${p}-a2`, "2026-10-03T14:30:00.000Z", "2026-10-03T15:15:00.000Z", 1));
      expect(clash).toEqual({ ok: false, reason: "conflict" });
      const adjacent = await store.appointments.insertIfFree(appt(fixture, `${p}-a3`, "2026-10-03T14:45:00.000Z", "2026-10-03T15:30:00.000Z", 1));
      expect(adjacent.ok).toBe(true);
    });

    it("transition es compare-and-set y libera el espacio al cancelar", async () => {
      const { store, fixture } = await setup();
      const p = fixture.salon.id;
      await store.appointments.insertIfFree(appt(fixture, `${p}-b1`, "2026-10-04T14:00:00.000Z", "2026-10-04T14:45:00.000Z"));
      const cancelled = await store.appointments.transition(`${p}-b1`, ["booked"], { status: "cancelled", cancelledAt: "2026-10-01T14:00:00.000Z" });
      expect(cancelled?.status).toBe("cancelled");
      expect(await store.appointments.transition(`${p}-b1`, ["booked"], { status: "cancelled" })).toBeUndefined();
      const rebook = await store.appointments.insertIfFree(appt(fixture, `${p}-b2`, "2026-10-04T14:00:00.000Z", "2026-10-04T14:45:00.000Z", 1));
      expect(rebook.ok).toBe(true);
      const listed = await store.appointments.list({ from: "2026-10-04T00:00:00.000Z", to: "2026-10-05T00:00:00.000Z", statuses: ["booked"] });
      expect(listed.map((a) => a.id)).toEqual([`${p}-b2`]);
    });

    it("una oferta solo se acepta una vez y el hueco solo se llena una vez", async () => {
      const { store, fixture } = await setup();
      const p = fixture.salon.id;
      const origin = appt(fixture, `${p}-c1`, "2026-10-05T14:00:00.000Z", "2026-10-05T14:45:00.000Z");
      await store.appointments.insertIfFree(origin);
      await store.appointments.transition(origin.id, ["booked"], { status: "cancelled" });
      const gap: Gap = {
        id: `${p}-gap`,
        salonId: p,
        staffId: origin.staffId,
        start: origin.start,
        end: origin.end,
        originAppointmentId: origin.id,
        status: "open",
        wave: 1,
        createdAt: "2026-10-01T14:00:00.000Z",
      };
      await store.gaps.insert(gap);
      const offers: Offer[] = fixture.clients.map((c, i) => ({
        id: `${p}-offer-${i}`,
        salonId: p,
        gapId: gap.id,
        clientId: c.id,
        serviceId: fixture.services[0]!.id,
        staffId: gap.staffId,
        start: gap.start,
        end: gap.end,
        wave: 1,
        source: "cycle",
        score: 1.5,
        status: "pending",
        sentAt: "2026-10-01T14:00:00.000Z",
        expiresAt: "2026-10-01T14:15:00.000Z",
      }));
      await store.offers.insertMany(offers);
      // Reintento idempotente: no duplica.
      await store.offers.insertMany(offers);
      expect(await store.offers.list({ gapId: gap.id })).toHaveLength(2);

      const [a, b] = await Promise.all([
        store.offers.transition(offers[0]!.id, "pending", { status: "accepted" }),
        store.offers.transition(offers[0]!.id, "pending", { status: "accepted" }),
      ]);
      expect([a, b].filter(Boolean)).toHaveLength(1);

      const filled = await store.gaps.transition(gap.id, "open", { status: "filled", filledAt: "2026-10-01T14:05:00.000Z" });
      expect(filled?.status).toBe("filled");
      expect(await store.gaps.transition(gap.id, "open", { status: "filled" })).toBeUndefined();
    });

    it("mensajes: idempotencia por id del proveedor y orden cronológico", async () => {
      const { store, fixture } = await setup();
      const phone = fixture.clients[0]!.phone;
      for (const [i, text] of ["hola", "quiero un fade"].entries()) {
        await store.messages.insert({
          id: `${fixture.salon.id}-m${i}`,
          salonId: fixture.salon.id,
          phone,
          direction: "in",
          text,
          purpose: "reply",
          providerMessageId: `${fixture.salon.id}-wamid-${i}`,
          at: `2026-10-01T14:0${i}:00.000Z`,
        });
      }
      expect(await store.messages.existsProviderId(`${fixture.salon.id}-wamid-1`)).toBe(true);
      expect(await store.messages.existsProviderId("otro")).toBe(false);
      expect((await store.messages.list({ phone })).map((m) => m.text)).toEqual(["hola", "quiero un fade"]);
    });

    it("guarda y recupera el estado de una conversación", async () => {
      const { store, fixture } = await setup();
      const phone = fixture.clients[0]!.phone;
      await store.conversations.save({ salonId: fixture.salon.id, phone, state: { step: "idle" }, updatedAt: "2026-10-01T14:00:00.000Z" });
      await store.conversations.save({ salonId: fixture.salon.id, phone, state: { step: "choosing" }, updatedAt: "2026-10-01T14:01:00.000Z" });
      expect((await store.conversations.get(phone))?.state).toEqual({ step: "choosing" });
    });
  });
}
