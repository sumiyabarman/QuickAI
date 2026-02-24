import { clerkClient } from "@clerk/express";
import OpenAI from "openai";
import sql from "../configs/db.js";
import axios from "axios";
import FormData from "form-data";
import {v2 as cloudinary} from 'cloudinary'
import "dotenv/config"
import fs from "fs"
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js"


const AI = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

export const generateArticle = async (req,res) => {
    try {
        const {userId} = await req.auth();
        const {prompt, length} = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;
        

        if(plan !== 'premium' && free_usage >= 10)
        {
            return res.json({ success: false, message: "Limit reached. Upgrade to continue."})
        }

        const response = await AI.chat.completions.create({
            model: "gemini-3-flash-preview",
            messages: [
            {
                role: "user",
                content: prompt,
            },
        ],
        temperature: 0.7,
        max_tokens: length,
    });

    /* get response form this AI */
    const content = response.choices[0].message.content


    /*store the response data in database for that write SQL query */
    await sql `INSERT INTO creations (user_id,prompt,content,type)
    VALUES (${userId}, ${prompt}, ${content}, 'article')`;

    if(plan !== 'premium'){
        await clerkClient.users.updateUserMetadata(userId,{
            privateMetadata:{
                free_usage : free_usage + 1
            }
        })
    }

    res.json({success:true, content})

    } catch (error) {
        console.log(error.message)
        res.json({success:false, message:error.message})
    }
}


export const generateBlogTitle = async (req,res) => {
    try {
        const {userId} = await req.auth();
        const {prompt} = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        if(plan !== 'premium' && free_usage >= 10)
        {
            return res.json({ success: false, message: "Limit reached. Upgrade to continue."})
        }

        const response = await AI.chat.completions.create({
            model: "gemini-3-flash-preview",
            messages: [{role: "user",content: prompt} ],
        temperature: 0.7,
        max_tokens: 500,
    });

    /* get response form this AI */
    const content = response.choices[0].message.content


    /*store the response data in neon database for that write SQL query */
    await sql `INSERT INTO creations (user_id,prompt,content,type)
    VALUES (${userId}, ${prompt}, ${content}, 'blog-title')`;

    if(plan !== 'premium'){
        await clerkClient.users.updateUserMetadata(userId,{
            privateMetadata:{
                free_usage : free_usage + 1
            }
        })
    }

    res.json({success:true, content})
    

    } catch (error) {
        console.log(error.message)
        res.json({success:false, message:error.message})
    }
}


export const generateImage = async (req,res) => {
    try {
        
        const { userId } = await req.auth();
        const {prompt, publish} = req.body;
        let plan = req.plan;
       
        console.log(plan)
        
        if(plan !== 'u:primium')
        {
            return res.json({ success: false, message: "This feature is only available for premium subscriptions"})
        }
        
       
        /* use clipdrop api */ 
        const formData = new FormData()
        formData.append('prompt', prompt)
        
        const {data}= await axios.post("https://clipdrop-api.co/text-to-image/v1",formData,{
            headers:{'x-api-key': process.env.CLIPDROP_API_KEY,
               
            },
            responseType:"arraybuffer",
        })
        

        const base64Image = `data:image/png;base64,${Buffer.from(data,'binary').toString('base64')}`;
        
        const {secure_url} = await cloudinary.uploader.upload(base64Image)


    /*store the response data in database for that write SQL query */
    await sql `INSERT INTO creations (user_id,prompt,content,type,publish)
    VALUES (${userId}, ${prompt}, ${secure_url}, 'image', ${publish?? false})`;


    res.json({success:true, content: secure_url})

    } catch (error) {
        console.log(error.message)
        res.json({success:false, message:error.message})
    }
}


export const removeImageBackground = async (req,res) => {
    try {
        
        const { userId } = await req.auth();
        const image = req.file;
        const plan = req.plan;
       
        console.log(plan)
        
        if(plan !== 'u:primium')
        {
            return res.json({ success: false, message: "This feature is only available for premium subscriptions"})
        }
        
       
        const {secure_url} = await cloudinary.uploader.upload(image.path,{
            transformation:[
                {
                    effect:'background_removal',
                    background_removal:'remove_the_background'
                }
            ]
        })


    /*store the response data in database for that write SQL query */
    await sql `INSERT INTO creations (user_id,prompt,content,type)
    VALUES (${userId}, 'Remove background from image', ${secure_url}, 'image')`;


    res.json({success:true, content: secure_url})

    } catch (error) {
        console.log(error.message)
        res.json({success:false, message:error.message})
    }
}




export const removeImageObject = async (req,res) => {
    try {
        
        const { userId } = await req.auth();
        const { object } = await req.body;
        const image = req.file;
        const plan = req.plan;
        
        
        if(plan !== 'u:primium')
        {
            return res.json({ success: false, message: "This feature is only available for premium subscriptions"})
        }
        
       
        const {public_id} = await cloudinary.uploader.upload(image.path)
        const imageUrl = cloudinary.url(public_id,{
            transformation:[{effect:`gen_remove:${object}`}],
            resource_type:'image'
        })


    /*store the response data in database for that write SQL query */
    await sql `INSERT INTO creations (user_id,prompt,content,type)
    VALUES (${userId}, ${`Removed${object} from image`}, ${imageUrl}, 'image')`;


    res.json({success:true, content: imageUrl})

    } catch (error) {
        console.log(error.message)
        res.json({success:false, message:error.message})
    }
}


export const resumeReview = async (req,res) => {
    try {
        const { userId } = await req.auth();
        const resume = req.file;
        const plan = req.plan;

        if(plan !== 'u:premium'){
            return res.json({
                success:false,
                message:"This feature is only available for premium subscriptions"
            })
        }

        if(!resume){
            return res.json({success:false,message:"No file uploaded"})
        }

        if(resume.size > 5*1024*1024){
            return res.json({
                success:false,
                message:"Resume file size exceeds allowed size (5MB)."
            })
        }

        // read file
        const dataBuffer = fs.readFileSync(resume.path)

        // parse PDF
        const loadingTask = pdfjsLib.getDocument({ data: dataBuffer })
        const pdfDoc = await loadingTask.promise

        let pdfText = ""

        for(let i=1;i<=pdfDoc.numPages;i++){
            const page = await pdfDoc.getPage(i)
            const content = await page.getTextContent()
            pdfText += content.items.map(item=>item.str).join(" ")
        }

        // AI prompt
        const prompt = `Review the following resume and provide constructive feedback on its strengths, weaknesses, and areas for improvement.\n\nResume content:\n${pdfText}`

        const response = await AI.chat.completions.create({
            model:"gemini-3-flash-preview",
            messages:[{role:"user",content:prompt}],
            temperature:0.7,
            max_tokens:1000
        })

        const content = response.choices[0].message.content

        // save to DB
        await sql`
        INSERT INTO creations (user_id,prompt,content,type)
        VALUES (${userId}, 'Review the uploaded resume', ${content}, 'resume-review')
        `

        res.json({success:true,content})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}