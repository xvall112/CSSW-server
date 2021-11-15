import {
  UserInputError,
  ValidationError,
  AuthenticationError,
} from "apollo-server-express";
export default {
  Query: {
    //vypis licenci
    licenses: async (parent, input, { user, prisma }) => {
      /*  if (!user) {
        throw new AuthenticationError(`Nejste přihlášen`);
      } */

      const licenses = await prisma.license.findMany({
        include: {
          contract: true,
          software: true,
          licenseEvents: true,
        },
      });
      return licenses;
    },

    //vypis jedne licence
    oneLicense: async (parent, { id }, { user, prisma }) => {
      /*  if (!user) {
        throw new AuthenticationError(`Nejste přihlášen`);
      } */
      const parseId = await parseInt(id);
      const license = await prisma.license.findUnique({
        where: {
          id: parseId,
        },
        include: {
          contract: true,
          software: true,
          licenseEvents: {
            orderBy: {
              assignedAt: "desc",
            },
            select: {
              assignedAt: true,
              assignedByUser: { select: { name: true, id: true } },
              LicenseEventType: {
                select: { value: true },
              },
              station: true,
              ticketId: true,
            },
          },
        },
      });
      return license;
    },
  },

  Mutation: {},
};
