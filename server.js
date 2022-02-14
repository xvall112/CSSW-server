const fs = require("fs");
import { ApolloServer, gql, AuthenticationError } from "apollo-server-express";
import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import expressJwt from "express-jwt";
import resolvers from "./graphql/resolvers";
import { PrismaClient } from "@prisma/client";

const port = 9000;
export const prisma = new PrismaClient();
export const jwtSecret = Buffer.from(
  "Zn8Q5tyZ/G1MHltc4F/gTkVJMlrbKiZt",
  "base64"
);

const app = express();

app.use(
  cors(),
  bodyParser.json({ limit: "50mb" }),
  expressJwt({
    secret: jwtSecret,
    credentialsRequired: false,
  })
);

const typeDefs = gql(
  fs.readFileSync("./graphql/schema.graphql", { encoding: "utf8" })
);

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req, res, connection }) => {
    if (req) {
      return {
        user: req.user,
        prisma,
        res,
      };
    }
  },
});
apolloServer.applyMiddleware({ app, path: "/graphql" });

app.listen(port, () => console.info(`Server started on port ${port}`));
