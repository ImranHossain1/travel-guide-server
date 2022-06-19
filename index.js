const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app= express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 5000
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6hmhs.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message: 'Unauthorized Access'})
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
    if(err){
      return res.status(403).send({message:"Forbidden Access"})
    }
    req.decoded= decoded;
    next();
  });
}
async function run(){
  try{
    await client.connect();
    const destinationCollection = client.db('TravelGuide').collection('destinations');
    const bookedDestinationCollection = client.db('TravelGuide').collection('booking');
    const photosCollection = client.db('TravelGuide').collection('photos');
    const userCollection = client.db('TravelGuide').collection('users');
    const paymentCollection = client.db('TravelGuide').collection('payments');

    const verifyAdmin = async(req, res, next)=>{
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({email: requester})
      if(requesterAccount.role==='admin'){
        next();
      }
      else{
        return res.status(403).send({message: 'Forbidden Access'});
      }
    }

    app.get('/destination', async(req,res)=>{
      const query= {};
      const cursor= destinationCollection.find(query);
      const destinations =await cursor.toArray();
      res.send(destinations);
    })
    app.get('/destination/:id', async(req,res)=>{
      const id = req.params.id;
      const query= {_id: ObjectId(id)};
      const destination = await destinationCollection.findOne(query);
      res.send(destination);
    })

    //delete Destinations
    app.delete('/destination/:id',verifyJWT, verifyAdmin, async(req,res)=>{
      const id = req.params.id;
      const filter = {_id:ObjectId(id)}
      const result = await destinationCollection.deleteOne(filter);
      res.send(result);
    })
    // Add New Travel Destination
    app.post('/destination',verifyJWT, async(req,res)=>{
      const destination = req.body;
      const result = await destinationCollection.insertOne(destination);
      res.send(result)
    })

    app.get('/photos', async(req,res)=>{
      const query= {};
      const cursor= photosCollection.find(query);
      const photos =await cursor.toArray();
      res.send(photos);
    })
    app.post('/photos',verifyJWT, async(req,res)=>{
      const photo = req.body;
      const result = await photosCollection.insertOne(photo);
      res.send(result)
    })

    //add user information to the database
    app.put('/user/:email', async(req,res)=>{
      const email = req.params.email;
      const user = req.body;
      const filter = {email: email};
      const options = {upsert : true};
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc,options);
      const token= jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({result, token});
    })
    //Get perticular User
    app.get('/user/:email', async(req, res)=>{
      const email= req.params.email;
      const filter = {email: email};
      const result = await userCollection.findOne(filter);
      res.send(result)
    })

    // Get users from DB
    app.get('/users', verifyJWT, async(req,res)=>{
      const users = await userCollection.find().toArray();
      res.send(users);
    })
    //add a new booking user 
    app.post('/bookedDestination',verifyJWT, async(req,res)=>{
      const confirmBooking = req.body;
      
      const query = {date: confirmBooking.date, userName: confirmBooking.userName};
      //console.log(query)
      const exists = await bookedDestinationCollection.findOne(query);
       if(exists){
          console.log(exists)
           return res.send({success: false, confirmBooking: exists})
       }
      const result =await bookedDestinationCollection.insertOne(confirmBooking);
      return res.send({success: true,result});
    })
    app.get('/user', verifyJWT, async(req,res)=>{
      const user = await userCollection.find().toArray();
      res.send(user);
    })
    //verify user role
    app.get('/admin/:email',verifyJWT, async(req,res)=>{
      const email = req.params.email;
      const user = await userCollection.findOne({email:email})
      const isAdmin = user.role ==='admin';
      res.send({admin: isAdmin});
    })
    //add user role as ADMIN
    app.put('/user/admin/:email',verifyJWT, verifyAdmin, async(req,res)=>{
      const email= req.params.email;
      const filter= {email: email}
      const updatedDoc = {
        $set: {role: 'admin'}
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send({result});
    })

    //get user bookings from DB
    app.get('/booking', async(req,res)=>{
      const userEmail = req.query.userEmail;
      const query = {userEmail: userEmail}
      const bookings = await bookedDestinationCollection.find(query).toArray();
      res.send(bookings);
    })

    app.get('/booking/:id',verifyJWT, async(req,res)=>{
      const id = req.params.id;
      const query ={ _id: ObjectId(id)};
      const booking =await bookedDestinationCollection.findOne(query);
      res.send(booking)
    })

    //Payment
    app.patch('/booking/:id', verifyJWT, async(req,res)=>{
      const id = req.params.id;
      const payment = req.body;
      const filter ={_id : ObjectId(id)};;
      const updatedDoc = {
        $set : {
          paid: true,
          transactionId: payment.transactionId
        }
      }
      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await bookedDestinationCollection.updateOne(filter, updatedDoc);
      res.send(updatedDoc)
    })
    app.post('/create-payment-intent',verifyJWT, async(req,res)=>{
      const booking = req.body;
      const cost = booking.cost;
      const amount = cost*100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "eur",
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })
  }
  finally{

  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello from car dealer!')
})

app.listen(port, () => {
  console.log(`car dealer app listening on port ${port}`)
})