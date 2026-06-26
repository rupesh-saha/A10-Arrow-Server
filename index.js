const express = require('express')
const cors = require('cors');
const app = express()
const port = 5001
require('dotenv').config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = process.env.ARROW_URI;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("arrowDB");
    const tasksCollection = database.collection("tasks");
    const usersCollection = database.collection("user");
    const proposalsCollection = database.collection("proposals");




    app.post('/api/tasks', async (req, res) => {
      const taskData = req.body;

      const newTask = {
        title: taskData.title,
        category: taskData.category,
        description: taskData.description,
        budget: Number(taskData.budget),
        deadline: new Date(taskData.deadline),
        client_email: taskData.client_email,
        status: "Open",
        deliverable_url: null,
        createdAt: new Date()
      };

      const result = await tasksCollection.insertOne(newTask);
      res.send(result);

    });

    app.get('/api/tasks', async (req, res) => {
      let query = {};
      if (req.query.email) {
        query.client_email = req.query.email;
      }
      const result = await tasksCollection.find(query).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    app.patch('/api/tasks/:id', async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          title: updatedData.title,
          category: updatedData.category,
          description: updatedData.description,
          budget: Number(updatedData.budget),
          deadline: new Date(updatedData.deadline),
        }
      };
      const result = await tasksCollection.updateOne(filter, updateDoc);
      res.send(result);
    });


    app.delete('/api/tasks/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tasksCollection.deleteOne(query);
      res.send(result);
    });

    app.get('/api/users/freelancers', async (req, res) => {
      const query = { role: "freelancer", isBlocked: { $ne: true } };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/api/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.get('/api/tasks/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tasksCollection.findOne(query);
      res.send(result);
    });

    app.post('/api/proposals', async (req, res) => {
      const proposalData = req.body;
      const newProposal = {
        task_id: proposalData.task_id,
        freelancer_email: proposalData.freelancer_email,
        proposed_budget: Number(proposalData.proposed_budget),
        estimated_days: Number(proposalData.estimated_days),
        cover_note: proposalData.cover_note,
        status: "Pending",
        submitted_at: new Date()
      };

      const result = await proposalsCollection.insertOne(newProposal);
      res.send(result);
    });

    app.get('/api/proposals/client/:email', async (req, res) => {
      const email = req.params.email;
      const clientTasks = await tasksCollection.find({ client_email: email }).toArray();

      const taskIds = clientTasks.map(task => task._id.toString());

      const proposals = await proposalsCollection.find({ task_id: { $in: taskIds } }).sort({ submitted_at: -1 }).toArray();
      const enrichedProposals = proposals.map(prop => {
        const relatedTask = clientTasks.find(t => t._id.toString() === prop.task_id);
        return {
          ...prop,
          task_title: relatedTask ? relatedTask.title : 'Unknown Task'
        };
      });

      res.send(enrichedProposals);
    });

    app.patch('/api/proposals/:id/accept', async (req, res) => {
      const id = req.params.id;
      const result = await proposalsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Accepted" } }
      );
      res.send(result);
    });

    app.delete('/api/proposals/:id', async (req, res) => {
      const id = req.params.id;
      const result = await proposalsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });






    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running for Arrow!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});