const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

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
    const selectedClassesCollection = client
      .db("capturedVisions")
      .collection("selectedClasses");

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

    // getting my selected classes for students
    app.get("/selectedClasses", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
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
    app.delete("/selectedClasses/:id", async(req, res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await selectedClassesCollection.deleteOne(query);
      res.send(result);
    })
    
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
