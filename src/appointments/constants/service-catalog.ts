export enum ServiceCatalogType {
  OIL_CHANGE = 'OIL_CHANGE',
  TIRE_ROTATION = 'TIRE_ROTATION',
  BRAKE_REPAIR = 'BRAKE_REPAIR',
  FULL_SERVICE = 'FULL_SERVICE',
  INSPECTION = 'INSPECTION',
  BATTERY_REPLACEMENT = 'BATTERY_REPLACEMENT',
  TIRE_REPLACEMENT = 'TIRE_REPLACEMENT',
}

export const ServiceCatalog: Record<string, number> = {
  [ServiceCatalogType.OIL_CHANGE]: 45,
  [ServiceCatalogType.TIRE_ROTATION]: 45,
  [ServiceCatalogType.BRAKE_REPAIR]: 120,
  [ServiceCatalogType.FULL_SERVICE]: 180,
  [ServiceCatalogType.INSPECTION]: 30,
  [ServiceCatalogType.BATTERY_REPLACEMENT]: 45,
  [ServiceCatalogType.TIRE_REPLACEMENT]: 90,
};
