import {
  UserInputError,
  ValidationError,
  AuthenticationError,
} from "apollo-server-express";
import { parse } from "path/posix";
export default {
  Query: {
    // vypis licenci na stanici podle cisla stanice
    getStationLicenses: async (parent, { station }, { user, prisma }) => {
      return prisma.station.findUnique({
        where: {
          name: station,
        },
        select: {
          licenses: {
            select: {
              id: true,
              evidenceNumber: true,
              software: { select: { id: true, name: true } },
            },
          },
        },
      });
    },

    //vypis software
    allSoftware: async (parent, input, { user, prisma }) => {
      const allSoftware = await prisma.software.findMany({
        include: {
          licenses: true,
        },
      });
      return allSoftware;
    },

    //vypis vsech licenci
    licenses: async (parent, { input, limit, offset }, { user, prisma }) => {
      /*  if (!user) {
        throw new AuthenticationError(`Nejste přihlášen`);
      } */
      //filtrovani licenci podle jmena softwaru, cislo pozadavku a cislo stanice
      const [countLicenses, licenses] = await prisma.$transaction([
        prisma.license.count({
          where: {
            software: {
              OR: [
                {
                  name: {
                    contains: input,
                  },
                },
                {
                  nameOfProduct: {
                    contains: input,
                  },
                },
              ],
            },
          },
        }),
        prisma.license.findMany({
          skip: offset,
          take: limit,
          where: {
            software: {
              OR: [
                {
                  name: {
                    contains: input,
                  },
                },
                {
                  nameOfProduct: {
                    contains: input,
                  },
                },
              ],
            },
          },

          include: {
            station: true,
            contract: true,
            software: true,
            licenseEvents: true,
          },
        }),
      ]);

      return { countLicenses, licenses };
    },

    //vypis detail jedne licence
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

    allStations: async (parent, input, { user, prisma }) => {
      return await prisma.station.findMany({
        where: {
          isUsed: true,
        },
      });
    },
  },

  Mutation: {
    //pridani stanice do sis
    addStationToSis: async (parent, { stations }, { user, prisma }) => {
      return await stations.map(async (station) => {
        const findStation = await prisma.station.findUnique({
          where: {
            name: station,
          },
        });
        //pokud stanice byla drive odebrana
        if (findStation && findStation.isUsed === false) {
          //update isUsed na true
          await prisma.station.update({
            where: { name: station },
            data: { isUsed: true },
          });
        } else {
          //jinak pridana nova stanice
          await prisma.station.create({
            data: { name: station },
          });
        }
      });
    },

    //funkce zda je stanice v SIS
    isStation: async (parent, { station }, { user, prisma }) => {
      if (station === null) return false;
      const isStation = await prisma.station.findUnique({
        where: {
          name: station,
        },
      });
      if (isStation && isStation.isUsed === true) {
        return true;
      } else {
        return false;
      }
    },
    //blokovani stanice + uvolneni vsech licenci ktere bylz na stanici
    deleteStation: async (
      _parent,
      { stations, requirement },
      { user, prisma }
    ) => {
      const deleteStations = stations.map(async (stationId) => {
        //id vsech licenci na stanici
        const stationLicenses = await prisma.station.update({
          where: { name: stationId },
          data: { isUsed: false },
          select: {
            name: true,
            licenses: {
              select: {
                id: true,
              },
            },
          },
        });

        //update vsech licenci na stanici
        const updateLicenses = await stationLicenses.licenses.map(
          async (license) => {
            const updateLicense = await prisma.license.update({
              where: { id: license.id },
              data: {
                isAssigned: false,
                stationName: null,
                //vytvoreni noveho eventu odebrani licence ze stanice
                licenseEvents: {
                  create: {
                    ticketId: requirement,
                    LicenseEventType: { connect: { id: 2 } },
                    station: { connect: { name: stationId } },
                    assignedByUser: { connect: { id: user.id } },
                  },
                },
              },
            });
          }
        );
        return stationLicenses;
      });
      return deleteStations;
    },

    /* TODO: overit prihlaseni uzivatele */
    /* TODO: overit stanici zda je v SISu */

    //odebrani licence ze stanice
    removeLicenses: async (
      _parent,
      { station, requirement, licenseId },
      { user, prisma }
    ) => {
      //najde id vsech licenci ktere jsou na stanici
      const stationLicenses = await prisma.station.findUnique({
        where: { name: station },
        select: {
          licenses: {
            select: {
              id: true,
            },
          },
        },
      });

      //upravy vsechny licence ktere jsou na danne stanici podle id na volne
      const removeLicenses = await licenseId.map(async (item) => {
        //pokud stanice ma pridelenou licenci kterou chceme odebrat
        if (
          stationLicenses.licenses.some((licenseId) => {
            return licenseId.id === parseInt(item);
          })
        ) {
          //upravime licenci na volna
          const removeLicense = await prisma.license.update({
            where: {
              id: parseInt(item),
            },
            data: {
              isAssigned: false,
              stationName: null,
              //vytvoreni noveho eventu odebrani licence ze stanice
              licenseEvents: {
                create: {
                  ticketId: requirement,
                  LicenseEventType: { connect: { id: 2 } },
                  station: { connect: { name: station } },
                  assignedByUser: { connect: { id: user.id } },
                },
              },
            },
            include: {
              software: true,
              station: true,
            },
          });
          return removeLicense;
          //pokud odebirana licence neni na stanici error
        } else {
          throw new Error("Stanice nemá přidělený tento software");
        }
      });
      return removeLicenses;
    },

    addLicenses: async (
      _parent,
      { station, requirement, softwareId },
      { user, prisma }
    ) => {
      const addLicenses = softwareId.map(async (item) => {
        //najde volnou licenci daneho softwaru na zaklade id softwaru
        const license = await prisma.license.findFirst({
          where: {
            AND: [
              {
                softwareId: {
                  equals: parseInt(item),
                },
              },
              {
                stationName: {
                  equals: null,
                },
              },
            ],
          },
        });

        // id veskereho softwaru na stanici
        const stationLicenses = await prisma.station.findUnique({
          where: {
            name: station,
          },
          select: {
            licenses: {
              select: {
                softwareId: true,
              },
            },
          },
        });
        //pokud je pridelovany softvare jiz pridelen na stanici error
        if (
          stationLicenses.licenses.some((software) => {
            return software.softwareId === parseInt(item);
          })
        )
          throw new Error(`Stanice má přidělený tento software`);
        //pokud neni volna licence error
        if (!license) throw new Error("Není volná licence pro tento software");
        //aktualizace dat na licenci
        const updateLicense = await prisma.license.update({
          where: {
            id: license.id,
          },
          data: {
            isAssigned: true,
            station: { connect: { name: station } },
            //vytvoreni noveho eventu prirazeni licence
            licenseEvents: {
              create: {
                ticketId: requirement,
                LicenseEventType: { connect: { id: 1 } },
                station: { connect: { name: station } },
                assignedByUser: { connect: { id: user.id } },
              },
            },
          },
          include: {
            software: true,
            station: true,
          },
        });
        return updateLicense;
      });
      return addLicenses;
    },

    //pridani nove licence
    createLicense: async (parent, { input }, { user, prisma }) => {
      let noCreate = [];
      const createManyLicenses = await input.map(async (input) => {
        /* const duplicates = await prisma.license.findUnique({
          where: {
            evidenceNumber: input.evidenceNumber,
          },
        });
        if (!duplicates) { */
        await prisma.license
          .create({
            data: {
              evidenceNumber: input.evidenceNumber,
              softwareAssurance: input.softwareAssurance != "" ? true : false,
              software: {
                connectOrCreate: {
                  where: { name: input.name },
                  create: {
                    name: input.name,
                    nameOfProduct:
                      input.nameOfProduct != "" ? input.nameOfProduct : null,
                    kcm: parseFloat(input.kcm),
                    partNumber:
                      input.partNumber != "" ? input.partNumber : null,
                  },
                },
              },
              contract: {
                connectOrCreate: {
                  where: { contractNumber: input.contractNumber },
                  create: {
                    contractNumber: input.contractNumber,
                    platnostSA:
                      input.platnostSA != ""
                        ? new Date(input.platnostSA).toISOString()
                        : null,
                    dateOfLifeCycle:
                      input.dateOfLifeCycle != ""
                        ? new Date(input.dateOfLifeCycle).toISOString()
                        : null,
                    datumUkonceniRozsirenePodpory:
                      input.datumUkonceniRozsirenePodpory != ""
                        ? new Date(
                            input.datumUkonceniRozsirenePodpory
                          ).toISOString()
                        : null,
                    datumUkonceniHlavniFazeTechnickePodpory:
                      input.datumUkonceniHlavniFazeTechnickePodpory != ""
                        ? new Date(
                            input.datumUkonceniHlavniFazeTechnickePodpory
                          ).toISOString()
                        : null,
                    datumUkonceniPodporyAktualizaceSP1:
                      input.datumUkonceniPodporyAktualizaceSP1 != ""
                        ? new Date(
                            input.datumUkonceniPodporyAktualizaceSP1
                          ).toISOString()
                        : null,
                    datumUkonceniPodporyAktualizaceSP2:
                      input.datumUkonceniPodporyAktualizaceSP2 != ""
                        ? new Date(
                            input.datumUkonceniPodporyAktualizaceSP2
                          ).toISOString()
                        : null,
                    datumUkonceniPodporyAktualizaceSP3:
                      input.datumUkonceniPodporyAktualizaceSP3 != ""
                        ? new Date(
                            input.datumUkonceniPodporyAktualizaceSP3
                          ).toISOString()
                        : null,
                    datumUkonceniPodporyAktualizaceSP4:
                      input.datumUkonceniPodporyAktualizaceSP4 != ""
                        ? new Date(
                            input.datumUkonceniPodporyAktualizaceSP4
                          ).toISOString()
                        : null,
                  },
                },
              },
            },
          })
          .catch((err) => {
            console.log(err.message);
            return;
          });
      });
      return createManyLicenses;
      console.log("no create:", noCreate);
      console.log("create license:", createManyLicenses);
    },
  },
};
