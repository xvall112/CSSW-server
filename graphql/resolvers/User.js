import {
  UserInputError,
  ValidationError,
  AuthenticationError,
} from "apollo-server-express";

import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { jwtSecret } from "../../server";

export default {
  Query: {
    //vypis vsech uzivatelu nepouzivane
    /*  users: async (root, args, { db, user }, info) => {
      if (!user) {
        console.log(user);
        throw new Error("Neprihlasen");
      }
      console.log(user);
      const users = await db.User.findAll();
      if (!users) {
        throw new Error("Zadny uzivatel nenalezen");
      }
      return users;
    }, */

    //detai uzivatele
    user: async (root, { id }, { prisma, user }, info) => {
      const parseId = await parseInt(id);
      //user ma pristup jen ke svemu uctu, admin a owner ma pristup ke vsem uctum
      if (
        !user ||
        (user.id !== parseId &&
          !user.role.includes(`owner`) &&
          !user.role.includes(`admin`))
      ) {
        throw new AuthenticationError(`Nemáte oprávnění pro výpis uživatele`);
      }
      //vyhledani uzivatele
      const existUser = await prisma.user.findUnique({
        where: {
          id: parseId,
        },
        include: {
          role: true,
        },
      });
      if (!existUser) {
        throw new Error("Uzivatel neexistuje");
      }
      return existUser;
    },
    // vyheldani uzivatele v tabelce uzivatelu na zaklade textu (vyhledava podle jmena nebo uzivatelskeho jmena)
    searchUsers: async (
      root,
      { contains, limit, offset },
      { prisma, user }
    ) => {
      //je user prihlaseny a ma upravneni
      if (
        !user ||
        (!user.role.includes(`owner`) && !user.role.includes(`admin`))
      ) {
        throw new AuthenticationError(`Nemáte oprávnění pro výpis uživatelů`);
      }
      const [countUsers, users] = await prisma.$transaction([
        prisma.user.count({
          where: {
            OR: [
              {
                name: {
                  contains: contains,
                },
              },
              {
                userName: {
                  contains: contains,
                },
              },
            ],
          },
        }),
        prisma.user.findMany({
          skip: offset,
          take: limit,
          where: {
            OR: [
              {
                name: {
                  contains: contains,
                },
              },
              {
                userName: {
                  contains: contains,
                },
              },
            ],
          },
          include: {
            role: true,
          },
        }),
      ]);
      return { countUsers, users };
    },
  },

  Mutation: {
    //pridani uzivatele
    createUser: async (root, { input }, { prisma, user }) => {
      //je user prihlaseny a ma upravneni
      if (
        !user ||
        (!user.role.includes(`owner`) && !user.role.includes(`admin`))
      ) {
        throw new AuthenticationError(
          `Nemáte oprávnění pro vytvoření uživatele`
        );
      }
      // destraction input
      const { name, userName, phone, utvar, role } = input;
      //pokud existuje uzivatel se stejnym uzivatelskym jmenem get error
      const userExists = await prisma.user.findUnique({
        where: {
          userName,
        },
      });
      if (userExists) {
        throw new Error("Uživatel s tímto uživatelským jménem již existuje");
      }
      let hashedPassword;
      //heshovani zadaneho hesla
      try {
        hashedPassword = await bcrypt.hash("111111", 12);
      } catch (err) {
        throw new Error("Nepodařilo se vytvořit uživatele, zkuste to znovu");
      }
      //vytvoreni uzivatele
      const newUser = await prisma.user.create({
        data: {
          name: name,
          userName: userName,
          phone: phone,
          utvar: utvar,
          roleId: role,
          password: hashedPassword,
        },
      });
      return newUser;
    },

    //prihlaseni uzivatele
    login: async (root, { userName, password }, { prisma }) => {
      //vyhledani uzivatele
      const user = await prisma.user.findUnique({
        where: {
          userName: userName,
        },
        include: {
          role: true,
        },
      });
      if (!user) {
        throw new UserInputError(`Špatné uživatelské jméno nebo heslo`);
      }
      if (user.isUsed === false) {
        throw new UserInputError(`Váš účet byl smazán`);
      }
      const { id, name, utvar, createdAt, phone, role } = user;
      //overeni hesla
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw new AuthenticationError(`Špatné uživatelské jméno nebo heslo`);
      }
      let token;
      //vytvoreni tokenu pro uspesne prihlaseneho uzivatele(expirace tokenu 8h)
      try {
        token = await jwt.sign(
          { id: user.id, role: [user.role.name] },
          jwtSecret,
          {
            expiresIn: "8h",
          }
        );
      } catch (err) {
        throw new AuthenticationError(`Přihlášení se nepodařilo, zkuste znovu`);
      }

      return {
        id,
        utvar,
        createdAt,
        userName,
        name,
        phone,
        token: token,
        role: role.name,
      };
    },

    //smazani uzivatele
    deleteUser: async (root, { id }, { prisma, user }) => {
      //je user prihlaseny a ma upravneni
      if (
        !user ||
        (!user.role.includes(`owner`) && !user.role.includes(`admin`))
      ) {
        throw new AuthenticationError(
          `Nemáte oprávnění pro odstranění uživatele`
        );
      }
      const parseId = await parseInt(id);
      //nalezeni uzivatele
      const userExists = await prisma.user.findUnique({
        where: {
          id: parseId,
        },
      });
      if (!userExists) {
        throw new Error("Uživatel neexistuje");
      }
      //smazani uzivatele
      await prisma.user.update({
        where: {
          id: parseId,
        },
        data: {
          isUsed: false,
        },
      });
    },

    //resetovani hesla
    resetPassword: async (root, { id }, { prisma, user }) => {
      //je user prihlaseny a ma upravneni
      const parseId = await parseInt(id);
      if (
        !user ||
        (!user.role.includes(`owner`) && !user.role.includes(`admin`))
      ) {
        throw new AuthenticationError(`Nemáte oprávnění pro reset hesla`);
      }
      //vyhledani uzivatele
      const existUser = await prisma.user.findUnique({
        where: {
          id: parseId,
        },
      });
      if (!existUser) {
        throw new Error("Uživatel neexistuje");
      }
      let hashedPassword;
      //nastaveni a hash reset hesla 111111
      try {
        hashedPassword = await bcrypt.hash("111111", 12);
      } catch (err) {
        throw new Error("Nepodařilo se resetovat heslo, zkuste to znovu");
      }
      //aktualizace hesla na 111111
      await prisma.user.update({
        where: {
          id: parseId,
        },
        data: {
          password: hashedPassword,
        },
      });
      return existUser;
    },

    //zmena hesla uzivatele
    changeUserPassword: async (
      root,
      { id, oldPassword, newPassword },
      { prisma, user }
    ) => {
      const parseId = await parseInt(id);
      if (!user || user.id !== parseId) {
        throw new AuthenticationError(`Nemáte oprávnění pro změnu hesla`);
      }
      //vyhledani uzivatele
      const existUser = await prisma.user.findUnique({
        where: {
          id: parseId,
        },
      });
      if (!existUser) {
        throw new Error("Uživatel neexistuje");
      }
      //overeni stavajiciho hesla
      const isValid = await bcrypt.compare(oldPassword, existUser.password);
      if (!isValid) {
        throw new UserInputError(`Špatné současné heslo`);
      }
      //hash noveho hesla
      const updatePassword = await bcrypt.hash(newPassword, 12);
      //aktualizace noveho hesla
      await prisma.user.update({
        where: {
          id: parseId,
        },
        data: {
          password: updatePassword,
        },
      });
      return existUser;
    },

    //update uzivatele
    updateUser: async (root, { id, input }, { prisma, user }) => {
      //je user prihlaseny a ma upravneni

      if (
        !user ||
        (!user.role.includes(`owner`) && !user.role.includes(`admin`))
      ) {
        throw new AuthenticationError(
          `Nemáte oprávnění pro změnu dat uživatele`
        );
      }
      const parseId = await parseInt(id);
      const { name, phone, utvar, role } = input;
      //vyhledani uzivatele
      const userExists = await prisma.user.findUnique({
        where: {
          id: parseId,
        },
      });
      if (!userExists) {
        throw new Error("Uživatel neexistuje");
      }
      //aktualizace udaju uzivatele
      const parseUserExists = await parseInt(userExists.id);
      try {
        await prisma.user.update({
          where: {
            id: parseUserExists,
          },
          data: {
            name,
            phone,
            utvar,
            roleId: role,
          },
        });
      } catch (err) {
        throw new Error("Nepodařilo se aktualizovat data, zkuste znovu");
      }

      return prisma.user.findUnique({
        where: {
          id: parseUserExists,
        },
      });
    },
  },
};
