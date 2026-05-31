import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const dealership = await prisma.dealership.upsert({
    where: { id: 'seed-dealership-1' },
    update: {},
    create: {
      id: 'seed-dealership-1',
      name: 'Keyloop Auto Center',
      address: '123 Industrial Ave, Birmingham, UK',
    },
  });
  console.log('Dealership:', dealership.name);

  const bay1 = await prisma.serviceBay.upsert({
    where: { id: 'seed-bay-1' },
    update: {},
    create: { id: 'seed-bay-1', dealershipId: dealership.id, name: 'Bay 1' },
  });
  const bay2 = await prisma.serviceBay.upsert({
    where: { id: 'seed-bay-2' },
    update: {},
    create: { id: 'seed-bay-2', dealershipId: dealership.id, name: 'Bay 2' },
  });
  console.log('Service bays:', bay1.name, bay2.name);

  const tech1 = await prisma.technician.upsert({
    where: { email: 'john.smith@keyloop.com' },
    update: {},
    create: {
      id: 'seed-tech-1',
      dealershipId: dealership.id,
      name: 'John Smith',
      email: 'john.smith@keyloop.com',
      specializations: ['OIL_CHANGE', 'TIRE_ROTATION', 'INSPECTION'],
    },
  });
  const tech2 = await prisma.technician.upsert({
    where: { email: 'jane.doe@keyloop.com' },
    update: {},
    create: {
      id: 'seed-tech-2',
      dealershipId: dealership.id,
      name: 'Jane Doe',
      email: 'jane.doe@keyloop.com',
      specializations: ['BRAKE_REPAIR', 'FULL_SERVICE', 'BATTERY_REPLACEMENT'],
    },
  });
  const tech3 = await prisma.technician.upsert({
    where: { email: 'alex.nguyen@keyloop.com' },
    update: {},
    create: {
      id: 'seed-tech-3',
      dealershipId: dealership.id,
      name: 'Alex Nguyen',
      email: 'alex.nguyen@keyloop.com',
      specializations: ['OIL_CHANGE', 'BRAKE_REPAIR', 'FULL_SERVICE', 'INSPECTION'],
    },
  });
  console.log('Technicians:', tech1.name, tech2.name, tech3.name);

  const customer1 = await prisma.customer.upsert({
    where: { id: 'seed-customer-1' },
    update: { name: 'Alice Johnson', email: 'alice.johnson@example.com', phone: '+441234000001' },
    create: {
      id: 'seed-customer-1',
      name: 'Alice Johnson',
      email: 'alice.johnson@example.com',
      phone: '+441234000001',
    },
  });
  const customer2 = await prisma.customer.upsert({
    where: { id: 'seed-customer-2' },
    update: { name: 'Bob Williams', email: 'bob.williams@example.com', phone: '+441234000002' },
    create: {
      id: 'seed-customer-2',
      name: 'Bob Williams',
      email: 'bob.williams@example.com',
      phone: '+441234000002',
    },
  });
  console.log('Customers:', customer1.name, customer2.name);

  const vehicle1 = await prisma.vehicle.upsert({
    where: { id: 'seed-vehicle-1' },
    update: { licensePlate: 'AB22 XYZ', make: 'Toyota', model: 'Camry', year: 2022 },
    create: {
      id: 'seed-vehicle-1',
      customerId: customer1.id,
      make: 'Toyota',
      model: 'Camry',
      year: 2022,
      licensePlate: 'AB22 XYZ',
    },
  });
  const vehicle2 = await prisma.vehicle.upsert({
    where: { id: 'seed-vehicle-2' },
    update: { licensePlate: 'CD23 ABC', make: 'Honda', model: 'City', year: 2023 },
    create: {
      id: 'seed-vehicle-2',
      customerId: customer2.id,
      make: 'Honda',
      model: 'City',
      year: 2023,
      licensePlate: 'CD23 ABC',
    },
  });
  console.log('Vehicles:', vehicle1.licensePlate, '/', vehicle2.licensePlate);

  console.log('\nSeed complete!');
  console.log('Dealership ID:', dealership.id);
  console.log('Customer 1 ID:', customer1.id);
  console.log('Customer 2 ID:', customer2.id);
  console.log('Vehicle 1 ID:', vehicle1.id);
  console.log('Vehicle 2 ID:', vehicle2.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
