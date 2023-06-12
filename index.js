const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

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

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
      const result = await classesCollection.find().toArray();
      res.send(result);
    });


    //storing new classes to classes database
    app.post("/allClasses", async(req, res)=>{
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    })

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

    //getting all users
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // updating users role
    app.patch("/users/admin/:id", async (req, res) => {
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
    app.post("/selectedClasses", async (req, res) => {
      const item = req.body;
      const result = await selectedClassesCollection.insertOne(item);
      res.send(result);
    });

    // delete single data from my selected classes
    app.delete("/selectedClasses/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassesCollection.deleteOne(query);
      res.send(result);
    });

    // payment related
    app.post("/createPaymentIntent", async (req, res) => {
      const { totalPrice } = req.body;
      const amount = totalPrice * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      // storing the payment info to database
      app.post("/payments", async (req, res) => {
        const payment = req.body;
        const insertResult = await paymentCollection.insertOne(payment);

        // deleting from selected page
        const query = {
          _id: { $in: payment.selectedClasses.map((id) => new ObjectId(id)) },
        };
        const deleteResult = await selectedClassesCollection.deleteMany(query);

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
            },
          };
          patchResult = await classesCollection.updateOne(
            updatedFilter,
            updateDoc
          );
        }

        res.send({ insertResult, deleteResult, patchResult });
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // getting payment info from database
    app.get("/payments", async (req, res) => {
      const result = await paymentCollection.find().toArray();
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
