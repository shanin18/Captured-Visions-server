require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

const app = express();
const cors = require("cors");

// middleware
const corsConfig = {
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
};
app.use(cors(corsConfig));
app.options("", cors(corsConfig));
app.use(express.json());

// verify With jwt
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }

  // bearer token
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gacal02.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const classesCollection = client
      .db("capturedVisions")
      .collection("classes");
    const instructorsCollection = client
      .db("capturedVisions")
      .collection("instructors");
    const usersCollection = client.db("capturedVisions").collection("users");
    const selectedClassesCollection = client
      .db("capturedVisions")
      .collection("selectedClasses");
    const paymentCollection = client
      .db("capturedVisions")
      .collection("payments");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1hr",
      });
      res.send({ token });
    });

    //Admin verify middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };

    // verify the Instructor email
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };

    // getting popular Classes based on number of enrolled
    app.get("/popularClasses", async (req, res) => {
      const query = {
        enrolled: { $gt: 2000 },
        availableSeats: { $gt: 0 },
      };

      const options = {
        projection: { name: 1, image: 1, instructor: 1, enrolled: 1 },
      };

      const result = await classesCollection.find(query, options).toArray();
      res.send(result);
    });

    // getting popular instructors based on number students
    app.get("/popularInstructors", async (req, res) => {
      const query = {
        students: { $gt: 5000 },
      };

      const options = {
        projection: { name: 1, image: 1, students: 1 },
      };

      const result = await instructorsCollection.find(query, options).toArray();
      res.send(result);
    });

    // getting all instructors data
    app.get("/allInstructors", async (req, res) => {
      const result = await instructorsCollection.find().toArray();
      res.send(result);
    });

    // getting all classes data
    app.get("/allClasses", async (req, res) => {
      const query = { status: "Approved" };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    // getting updating data by providing feedback to instructor
    app.patch("/allClasses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const message = req.body;
      const updateDoc = {
        $set: { feedback: message.message },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // instructor apis
    // getting all instructor classes
    app.get("/myClasses", verifyJWT, verifyInstructor, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send([]);
      }

      if (req.decoded.email !== email) {
        res.status(403).send({ error: true, message: "forbidden access" });
      }

      const query = { instructorEmail: email };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    //storing new classes to classes database
    app.post("/allClasses", verifyJWT, verifyInstructor, async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    // updating instructor class
    app.put("/myClasses/:id", verifyJWT, verifyInstructor, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const body = req.body;
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          name: body.name,
          image: body.image,
          instructor: body.instructor,
          instructorEmail: body.instructorEmail,
          availableSeats: body.availableSeats,
          price: body.price,
        },
      };

      const result = await classesCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    // Admin apis
    app.get("/manageAllClasses", verifyJWT, verifyAdmin, async (req, res) => {
      const status = req.query.status === "true";
      const email = req.query.email;
      if (!email) {
        return res.send([]);
      }

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { status: { $exists: status } };
      const result = await classesCollection
        .find(query)
        .sort({ status: -1 })
        .toArray();
      res.send(result);
    });

    // updating instructor classes status
    app.patch(
      "/manageAllClasses/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const status = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status.status,
          },
        };
        const result = await classesCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    //getting all users
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // storing all users
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    //verifying admin with email
    app.get("/users/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    //verifying instructor with email
    app.get(
      "/users/instructor/:email",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const email = req.params.email;

        if (req.decoded.email !== email) {
          res.send({ instructor: false });
        }

        const query = { email: email };
        const user = await usersCollection.findOne(query);
        const result = { instructor: user?.role === "instructor" };
        res.send(result);
      }
    );

    // updating users role
    app.patch("/users/admin/:id",verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const role = req.body;
      const filter = {
        _id: new ObjectId(id),
      };

      const updateDoc = {
        $set: {
          role: role.role,
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // getting my selected classes for students
    app.get("/selectedClasses", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { email: email };
      const result = await selectedClassesCollection.find(query).toArray();
      res.send(result);
    });

    // post my selected classes for students
    app.post("/selectedClasses", verifyJWT, async (req, res) => {
      const item = req.body;
      const result = await selectedClassesCollection.insertOne(item);
      res.send(result);
    });

    // delete single data from my selected classes
    app.delete("/selectedClasses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassesCollection.deleteOne(query);
      res.send(result);
    });

    // payment related
    app.post("/createPaymentIntent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // storing the payment info to database
    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      // deleting from selected page
      const query = { _id: new ObjectId(payment.selectedClass) };
      const deleteResult = await selectedClassesCollection.deleteOne(query);

      // decrementing or updating available seats when the payment succeeded
      const filter = {
        _id: { $in: payment.allClasses.map((id) => new ObjectId(id)) },
      };
      const classes = await classesCollection.find(filter).toArray();
      let patchResult;
      for (const singleClass of classes) {
        const updatedFilter = { _id: new ObjectId(singleClass._id) };
        const updateDoc = {
          $set: {
            availableSeats: singleClass.availableSeats - 1,
            enrolled: singleClass.enrolled + 1,
          },
        };
        patchResult = await classesCollection.updateOne(
          updatedFilter,
          updateDoc
        );
      }

      res.send({ insertResult, deleteResult, patchResult });
    });

    // getting payment info from database
    app.get("/payments", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { email: email };
      const result = await paymentCollection
        .find(query)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("captured vision is running....");
});

app.listen(port, () => {
  console.log(`captured visions is running on port ${port}`);
});
