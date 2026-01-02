const User = require('../models/users_models.js');
const jwt = require('jsonwebtoken');



const  register  =  async ( req , res ) =>{
    const { username, password } = req.body;
    if(!username || !password){
        return res.status(400).json({ message: 'Username and password are required' });
    }
  
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }
  
    const user = await User.create({ username, password });
  
    res.status(201).json({ message: 'User registered successfully' });
}


const login = async (req, res) => {
    const { username, password } = req.body;
    if(!username || !password){
        return res.status(400).json({ message: 'Username and password are required' });
    }
  
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Invalid username or password' });
    }
  
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid username or password' });
    }
  
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  
    res.status(200).json({ token });
}
module.exports = { register, login };