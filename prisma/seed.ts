import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashPas = () => {
    return bcrypt.hash("111111", 12);
  };
  const password = await hashPas();

  const roles = await prisma.role.createMany({
    data: [
      { id: 1, name: "admin", note: "" },
      { id: 2, name: "user", note: "" },
      { id: 3, name: "owner", note: "" },
    ],
  });

  const user = await prisma.user.create({
    data: {
      name: "Lukas Valta",
      userName: "valtaLu",
      phone: 295119,
      utvar: 3255,
      password: password,
      roleId: 3, //owner
      note: "",
    },
  });

  const licenseEventType = await prisma.licenseEventType.createMany({
    data: [
      { value: "add", note: "Pridani licence" },
      { value: "remove", note: "Odebrani licence" },
      { value: "reinstal", note: "Reinstalace stanice" },
    ],
  });

  console.log({ roles, user, licenseEventType, password });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
