const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");
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
    const InstructorsCollection = client
      .db("capturedVisions")
      .collection("instructors");

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

      const result = await InstructorsCollection.find(query, options).toArray();
      res.send(result);
    });

    // getting all the instructors
    app.get("/allInstructors", async (req, res)=>{
      const result = await InstructorsCollection.find().toArray();
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
