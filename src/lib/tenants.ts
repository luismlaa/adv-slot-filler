import "server-only";
import { type Container, getContainer } from "./container";
import type { SalonScope } from "./container";

export interface SalonRun<T> {
  readonly salonId: string;
  readonly ok: boolean;
  readonly result?: T;
  readonly error?: string;
}

/**
 * Corre un trabajo en cada salón activo (o solo en `only`), uno por uno. Un salón que falla no detiene a los demás:
 * su error queda en el log y en el resultado.
 */
export async function forEachSalon<T>(
  job: string,
  work: (scope: SalonScope) => Promise<T>,
  { directory, forSalon, logger }: Pick<Container, "directory" | "forSalon" | "logger"> = getContainer(),
  only?: string,
): Promise<SalonRun<T>[]> {
  const runs: SalonRun<T>[] = [];
  const active = await directory.activeSalonIds();
  for (const salonId of only ? active.filter((id) => id === only) : active) {
    try {
      runs.push({ salonId, ok: true, result: await work(await forSalon(salonId)) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Falló ${job} en un salón`, { salonId, error: message });
      runs.push({ salonId, ok: false, error: message });
    }
  }
  return runs;
}
