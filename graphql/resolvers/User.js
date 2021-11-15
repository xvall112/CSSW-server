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

    //jeden uzivatel account
    user: async (root, { id }, { prisma, user }, info) => {
      //user ma pristup jen ke svemu uctu, admin a owner ma pristup ke vsem uctum
      if (
        !user ||
        (user.id !== id &&
          !user.role.includes(`owner`) &&
          !user.role.includes(`admin`))
      ) {
        throw new AuthenticationError(`Nemáte oprávnění pro výpis uživatele`);
      }
      const parseId = await parseInt(id);
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

    searchUsers: async (root, { contains }, { prisma, user }) => {
      //je user prihlaseny a ma upravneni
      if (
        !user ||
        (!user.role.includes(`owner`) && !user.role.includes(`admin`))
      ) {
        throw new AuthenticationError(`Nemáte oprávnění pro výpis uživatelů`);
      }

      if (contains === "") {
        const users = await prisma.user.findMany({
          include: {
            role: true,
          },
        });
        if (!users) {
          throw new Error("Žádný uživatel nenalezen");
        }
        return users;
      }
      return prisma.user.findMany({
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
      });
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

      const { name, userName, phone, utvar, role } = input;
      const userExists = await prisma.user.findUnique({
        where: {
          userName,
        },
      });
      if (userExists) {
        throw new Error("Uživatel s tímto uživatelským jménem již existuje");
      }
      let hashedPassword;
      try {
        hashedPassword = await bcrypt.hash("111111", 12);
      } catch (err) {
        throw new Error("Nepodařilo se vytvořit uživatele, zkuste to znovu");
      }
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
     
      const { id, name, utvar, createdAt, phone, role } = user;
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw new AuthenticationError(`Špatné uživatelské jméno nebo heslo`);
      }
      let token;
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
      const userExists = await prisma.user.findUnique({
        where: {
          id: parseId,
        },
      });
      if (!userExists) {
        throw new Error("Uživatel neexistuje");
      }

      await prisma.user.delete({
        where: {
          id: parseId,
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
      const existUser = await prisma.user.findUnique({
        where: {
          id: parseId,
        },
      });
      if (!existUser) {
        throw new Error("Uživatel neexistuje");
      }
      let hashedPassword;
      try {
        hashedPassword = await bcrypt.hash("111111", 12);
      } catch (err) {
        throw new Error("Nepodařilo se resetovat heslo, zkuste to znovu");
      }
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

      const existUser = await prisma.user.findUnique({
        where: {
          id: parseId,
        },
      });
      if (!existUser) {
        throw new Error("Uživatel neexistuje");
      }
      const isValid = await bcrypt.compare(oldPassword, existUser.password);
      if (!isValid) {
        throw new UserInputError(`Špatné současné heslo`);
      }
      const updatePassword = await bcrypt.hash(newPassword, 12);

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
      const userExists = await prisma.user.findUnique({
        where: {
          id: parseId,
        },
      });
      if (!userExists) {
        throw new Error("Uživatel neexistuje");
      }
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
