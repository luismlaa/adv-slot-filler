import { type BusinessConfigOverrides, mergeDeep, resolveBusinessConfig } from "@/config/business";
import type { Service, Staff } from "@/domain/model";
import { recordActivity } from "./activity";
import type { AppContext } from "./context";

/** Guarda overrides de reglas de negocio del salón; valida el resultado completo antes de persistir. */
export async function updateBusinessSettings(ctx: AppContext, overrides: BusinessConfigOverrides) {
  const salon = await ctx.store.salon.get();
  const next = mergeDeep(salon.settings as BusinessConfigOverrides, overrides);
  const resolved = resolveBusinessConfig(next);
  await ctx.store.salon.updateSettings(next as Record<string, unknown>);
  await recordActivity(ctx, "settings.updated", "Se actualizaron las reglas de automatización del salón.");
  return resolved;
}

export async function saveStaff(ctx: AppContext, staff: Staff): Promise<Staff> {
  const saved = await ctx.store.staff.upsert({ ...staff, salonId: ctx.store.salonId });
  await recordActivity(ctx, "staff.updated", `Se actualizó a ${saved.name} (especialidades y horario).`, { staffId: saved.id });
  return saved;
}

export async function saveService(ctx: AppContext, service: Service): Promise<Service> {
  const saved = await ctx.store.services.upsert({ ...service, salonId: ctx.store.salonId });
  await recordActivity(ctx, "service.updated", `Se actualizó el servicio ${saved.name}.`);
  return saved;
}
