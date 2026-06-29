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
    const paymentsCollection = database.collection("payments");




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
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 9;
      const search = req.query.search || "";
      const category = req.query.category || "All";

      const query = { status: "Open" };

      if (search) {
        query.title = { $regex: search, $options: "i" };
      }
      if (category !== "All") {
        query.category = category;
      }

      const skip = (page - 1) * limit;
      const totalTasks = await tasksCollection.countDocuments(query);
      const totalPages = Math.ceil(totalTasks / limit);

      const tasks = await tasksCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      res.send({
        tasks,
        totalPages,
        currentPage: page,
        totalTasks
      });
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


    app.post('/api/payments/process', async (req, res) => {
      const { proposal_id, task_id, client_email, freelancer_email, amount } = req.body;

      const newPayment = {
        client_email,
        freelancer_email,
        task_id: task_id,
        amount: Number(amount),
        transaction_id: "mock_txn_" + Math.random().toString(36).substr(2, 9),
        payment_status: "succeeded",
        paid_at: new Date()
      };
      const paymentResult = await paymentsCollection.insertOne(newPayment);

      await proposalsCollection.updateOne(
        { _id: new ObjectId(proposal_id) },
        { $set: { status: "Accepted" } }
      );

      await proposalsCollection.updateMany(
        { task_id: task_id, _id: { $ne: new ObjectId(proposal_id) } },
        { $set: { status: "Rejected" } }
      );

      await tasksCollection.updateOne(
        { _id: new ObjectId(task_id) },
        { $set: { status: "In Progress" } }
      );

      res.send({ success: true, transaction_id: newPayment.transaction_id });
    });

    app.get('/api/dashboard/client/:email', async (req, res) => {
      const email = req.params.email;

      const totalTasks = await tasksCollection.countDocuments({ client_email: email });
      const openTasks = await tasksCollection.countDocuments({ client_email: email, status: "Open" });
      const inProgressTasks = await tasksCollection.countDocuments({ client_email: email, status: "In Progress" });

      const payments = await paymentsCollection.find({ client_email: email }).toArray();
      const totalSpent = payments.reduce((sum, p) => sum + p.amount, 0);

      res.send({ totalTasks, openTasks, inProgressTasks, totalSpent });
    });

    app.get('/api/dashboard/freelancer/:email', async (req, res) => {
      const email = req.params.email;

      const totalProposals = await proposalsCollection.countDocuments({ freelancer_email: email });
      const pendingProposals = await proposalsCollection.countDocuments({ freelancer_email: email, status: "Pending" });
      const acceptedProposals = await proposalsCollection.countDocuments({ freelancer_email: email, status: "Accepted" });

      const payments = await paymentsCollection.find({ freelancer_email: email }).toArray();
      const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);

      res.send({ totalProposals, pendingProposals, acceptedProposals, totalEarnings });
    });


    app.get('/api/proposals/freelancer/:email', async (req, res) => {
      const email = req.params.email;
      const proposals = await proposalsCollection.find({ freelancer_email: email }).sort({ submitted_at: -1 }).toArray();

      const taskIds = proposals.map(p => new ObjectId(p.task_id));
      const tasks = await tasksCollection.find({ _id: { $in: taskIds } }).toArray();

      const enrichedProposals = proposals.map(prop => {
        const relatedTask = tasks.find(t => t._id.toString() === prop.task_id);
        return {
          ...prop,
          task_title: relatedTask ? relatedTask.title : 'Unknown Task',
          task_budget: relatedTask ? relatedTask.budget : 0
        };
      });

      res.send(enrichedProposals);
    });

    app.get('/api/projects/freelancer/:email', async (req, res) => {
      const email = req.params.email;

      const acceptedProposals = await proposalsCollection.find({ freelancer_email: email, status: "Accepted" }).toArray();
      const taskIds = acceptedProposals.map(p => new ObjectId(p.task_id));

      const activeTasks = await tasksCollection.find({ _id: { $in: taskIds }, status: "In Progress" }).toArray();

      res.send(activeTasks);
    });

    app.patch('/api/tasks/:id/complete', async (req, res) => {
      const id = req.params.id;

      const result = await tasksCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Completed" } }
      );

      res.send(result);
    });


    app.get('/api/earnings/freelancer/:email', async (req, res) => {
      const email = req.params.email;

      const payments = await paymentsCollection.find({ freelancer_email: email, payment_status: "succeeded" }).sort({ paid_at: -1 }).toArray();

      const taskIds = payments.map(p => new ObjectId(p.task_id));
      const tasks = await tasksCollection.find({ _id: { $in: taskIds } }).toArray();

      let totalEarned = 0;

      const enrichedPayments = payments.map(p => {
        totalEarned += p.amount;
        const relatedTask = tasks.find(t => t._id.toString() === p.task_id);
        return {
          ...p,
          task_title: relatedTask ? relatedTask.title : 'Unknown Task'
        };
      });

      res.send({
        payments: enrichedPayments,
        totalEarned: totalEarned,
        averagePerTask: payments.length > 0 ? (totalEarned / payments.length) : 0
      });
    });


    app.get('/api/users/email/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      res.send(user || {});
    });

    app.patch('/api/users/profile/:email', async (req, res) => {
      const email = req.params.email;
      const { name, image, skills, bio, hourlyRate } = req.body;

      const result = await usersCollection.updateOne(
        { email: email },
        {
          $set: {
            name: name,
            image: image,
            skills: skills,
            bio: bio,
            hourlyRate: Number(hourlyRate)
          }
        }
      );
      res.send(result);
    });

    app.get('/api/admin/stats', async (req, res) => {
      const totalUsers = await usersCollection.countDocuments();
      const totalTasks = await tasksCollection.countDocuments();
      const activeTasks = await tasksCollection.countDocuments({ status: "In Progress" });

      const revenueData = await paymentsCollection.aggregate([
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]).toArray();
      const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

      const userRoles = await usersCollection.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } }
      ]).toArray();

      const taskStatus = await tasksCollection.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]).toArray();

      const recentPayments = await paymentsCollection.find().sort({ paid_at: -1 }).limit(5).toArray();

      res.send({
        stats: { totalUsers, totalTasks, totalRevenue, activeTasks },
        userRoles,
        taskStatus,
        recentPayments
      });
    });

    app.get('/api/admin/users', async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.patch('/api/admin/users/:id/toggle-block', async (req, res) => {
      const id = req.params.id;
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { isBlocked: !user.isBlocked } }
      );
      res.send(result);
    });

    app.get('/api/admin/tasks', async (req, res) => {
      const tasks = await tasksCollection.find().toArray();
      res.send(tasks);
    });

    app.delete('/api/admin/tasks/:id', async (req, res) => {
      const result = await tasksCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    app.get('/api/admin/payments', async (req, res) => {
      const payments = await paymentsCollection.find().sort({ paid_at: -1 }).toArray();

      const totalRevenue = payments.reduce((acc, curr) => acc + (curr.amount || 0), 0);
      const avgTransaction = payments.length > 0 ? totalRevenue / payments.length : 0;

      res.send({
        payments,
        totalRevenue,
        avgTransaction
      });
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