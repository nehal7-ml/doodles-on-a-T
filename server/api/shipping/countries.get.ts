import { listCountries } from "../../utils/shipping";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const region =
    typeof query.region === "string" ? query.region.toLowerCase() : undefined;
  const includeStates =
    query.includeStates === "true" || query.states === "true";

  const countries = (await listCountries())
    .filter((country) => !region || country.region?.toLowerCase() === region)
    .map((country) => ({
      code: country.code,
      name: country.name,
      region: country.region,
      ...(includeStates ? { states: country.states ?? [] } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    total: countries.length,
    countries,
  };
});
