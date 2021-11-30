/*
Copyright (c) 2019 Cloudinary

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), 
to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS 
IN THE SOFTWARE.
*/

const AWS = require('aws-sdk')
if (!AWS.config.region) {
	AWS.config.update({
		region: 'us-east-1'
	})
}

// --- Uncomment below to log AWS API calls
//AWS.config.logger = console

const rekognition = new AWS.Rekognition()
const rp = require('request-promise').defaults({
	encoding: null
})

const cloudinary = require('cloudinary').v2
const cld = require('./cld-utils')

const sharp = require("sharp")
const sharpness_threshold = 40

const environmentVariables = {
	rekognitionCollection: process.env.rekognitionCollection,
	confidence_threshold: process.env.confidenceThreshold,
	faceRecognitionFolder: process.env.faceRecognitionFolder,
	trainingFolder: process.env.trainingFolder,
	faceLabelTagPrefix: process.env.faceLabelTagPrefix,
	transformationParams: process.env.transformationParams,
}

/* const environmentVariables = {
	rekognitionCollection: "cld-rekog-collection",
	confidence_threshold: 80,
	faceRecognitionFolder: "assets",
	trainingFolder: "training",
	faceLabelTagPrefix: "faceLabel",
	transformationParams: "q_auto",
} */

/* 
	Used to replaces spaces in names before setting them as external id when invoking indexFace
*/
const replacementText = '.-.-.-'
const cloudinaryBaseUrl = 'https://res.cloudinary.com/' + cloudinary.config().cloud_name + '/image/upload/' + environmentVariables.transformationParams + '/'

/* 
	This function does either of 2 things based on the notification type from Cloudinary
	1. Indexes the image if the image was uploaded to training folder and has a 'faceLabel:' tag
	2. Searches for faces and tags them with people's names if search match was found
*/
exports.handler = async (event, context, callback) => {
	console.log('Incoming event - ', event)
	if (event.notification_type === 'resource_tags_changed') {
		for (const resource of event.resources) {
			if (resource.public_id.startsWith(environmentVariables.trainingFolder) && resource.added) {
				for (const tag of resource.added) {
					if (tag.startsWith(environmentVariables.faceLabelTagPrefix)) {
						const url = cloudinaryBaseUrl + resource.public_id + '.jpg'
						try {
							await processIndexOperation(resource.public_id, tag.substring(tag.indexOf(':') + 1, tag.length), url)
						} catch (error) {
							console.log("Indexing not successful for ", resource.url)
						}
						break
					}
				}
			}
		}
	} else if (event.notification_type === 'upload') {
		if (event.public_id.startsWith(environmentVariables.trainingFolder) && event.notification_type === 'upload' && event.tags && event.tags.length) {
			for (const tag of event.tags) {
				if (tag.startsWith(environmentVariables.faceLabelTagPrefix)) {
					const url = cloudinaryBaseUrl + event.public_id + '.jpg'
					try {
						await processIndexOperation(event.public_id, tag, url)
					} catch (error) {
						console.log("Indexing not successful for ", url)
					}
					break
				}
			}
		} else if (event.public_id.startsWith(environmentVariables.faceRecognitionFolder)) {
			const url = cloudinaryBaseUrl + event.public_id + '.jpg'
			const faceTags = await search(url).catch(error => {
				console.log("Error occurred during search ", error)
				throw error
			})
			console.log('Found face tags - ', faceTags)
			if (faceTags && faceTags.length > 0) {
				const cldResponse = await cld.addTags(faceTags, event.public_id).catch(error => {
					console.log("Could not add tag for %s, error - %s", event.public_id, error)
					throw error
				})
				console.log("Name added as as tags - ", cldResponse)
			}
		}
	}
}

/* 
	This function creates a recognition collection of a collection doesn't already exist. With an active collection, this function then
	invokes indexFace function. This function is the entry point to create a trained collection
*/
const processIndexOperation = async (public_id, tag, url) => {
	try {
		const collection = await rekognition.describeCollection({
			CollectionId: environmentVariables.rekognitionCollection
		}).promise()
		await indexFace(public_id, getExternalId(tag), url)
	} catch (error) {
		if (error.code === 'ResourceNotFoundException') {
			let createCollectionResponse = await rekognition.createCollection({
				CollectionId: environmentVariables.rekognitionCollection
			}).promise()
			console.log("Created collection ", createCollectionResponse)
			await indexFace(public_id, getExternalId(tag), url)
		} else {
			throw error
		}
	}
	/* rekognition.listCollections({}, async (error, data) => {
		if (error) {
			console.log('Collection could not be listed ', error)
			throw error
		}
		if (data.CollectionIds.indexOf(environmentVariables.rekognitionCollection) == -1) {
			let createCollectionResponse = await rekognition.createCollection({
				CollectionId: environmentVariables.rekognitionCollection
			}).promise()
			console.log("Created collection ", createCollectionResponse)
		}
		indexFace(public_id, getExternalId(tag), url)
	}) */
}

/* 
	Indexes the face from 'url' passed to this function. The external_id is saved as exterenal id on the AWS rekognition indexFaces 
	call
*/
const indexFace = async (public_id, external_id, url) => {
	const paramsIndexFace = {
		CollectionId: environmentVariables.rekognitionCollection,
		ExternalImageId: external_id,
		Image: {
			Bytes: await rp(url)
				.then(data => {
					return new Buffer.from(data, 'base64')
				})
				.catch(error => {
					console.log("Count not fetch url ", url)
					throw error
				})
		},
		MaxFaces: 1,
		QualityFilter: 'AUTO'
	}
	const dataIndex = await rekognition.indexFaces(paramsIndexFace).promise().catch(error => {
		throw error
	})
	if (dataIndex.FaceRecords && dataIndex.FaceRecords.length) {
		const faceId = dataIndex.FaceRecords[0].Face.FaceId
		console.log("Adding face id %s to public id %s, external id", faceId, public_id, external_id)
		const cldResponse = await cld.addTags(['faceId:' + faceId], public_id).catch(error => {
			console.log("Could not add face id tag for %s, error - %s", public_id, error)
			throw error
		})
		console.log("Face id tag added for ", cldResponse.public_id)

	} else {
		console.log("No faces found - ", JSON.stringify(dataIndex))
	}
}

/* 
	Searches for faces in the passed imageUrl against the trained collection. This function is the entry point to search for
	faces
*/
const search = async imageUrl => {
	console.time("search start")
	const response = await rp(imageUrl)
	const originalImageData = new Buffer.from(response, 'base64')
	const detectedFaces = await detectFaces(originalImageData)
	const sharpImg = sharp(originalImageData)
	const imageMetadata = await sharpImg.metadata()
	const croppedFacePromises = extractFaces(detectedFaces, originalImageData, imageMetadata)
	try {
		const croppedFaces = await Promise.all(croppedFacePromises)
		const faceTags = await searchFaces(croppedFaces.filter(element => element != null))
		console.timeEnd("search start")
		return faceTags
	} catch (error) {
		console.log('Could not perform search on ', imageUrl, error)
		throw error
	}
}

/* 
	This function uses rekognition service detectFaces function to retrieve coordinates for each faces in the passed image
*/
const detectFaces = async imageData => {
	const foundFaces = new Array()
	try {
		const detectParams = {
			Attributes: ["DEFAULT"],
			Image: {
				Bytes: imageData
			}
		}

		const detectFacePromise = rekognition.detectFaces(detectParams).promise()
		const faceDetectionResponse = await detectFacePromise

		if (faceDetectionResponse.FaceDetails && faceDetectionResponse.FaceDetails.length) {
			faceDetectionResponse.FaceDetails.forEach(element => {
				if (element.Quality.Sharpness >= sharpness_threshold) {
					foundFaces.push(element.BoundingBox)
				}
			})
		} else {
			console.log("no faces detected in stream image.")
		}
		return foundFaces
	} catch (error) {
		console.log("Could not detect faces ", error)
		throw error
	}
}

/* 
	This function extracts each face (for every entry on foundFaces) from the original image (imagebuffer) 
	based on coordinates found on foundFaces 
*/
const extractFaces = (faces, originalImageData, originalImageMetadata) => {
	const cropFacePromises = new Array()
	faces.forEach(element => {
		const left = Math.round(element.Left * originalImageMetadata.width),
			top = Math.round(element.Top * originalImageMetadata.height),
			width = Math.round(element.Width * originalImageMetadata.width),
			height = Math.round(element.Height * originalImageMetadata.height)

		cropFacePromises.push(
			sharp(originalImageData, {
				failOnError: false
			})
			.extract({
				left: left,
				top: top,
				width: width,
				height: height
			})
			.toBuffer()
			.then(data => data)
			.catch(error => {
				//--- Ignoring this error as some regions of image may not have faces
				console.log('Error during face extraction : ', error)
			})
		)
	})
	return cropFacePromises
}

/* 
	This function searches for each faces passed to it. If a match is found, it will retrieve the external id from each
	indexed face record and return it
*/
const searchFaces = async facesToSearch => {
	const faceSearchPromises = new Array()

	facesToSearch.forEach(face => {
		const paramsSearch = {
			CollectionId: environmentVariables.rekognitionCollection,
			FaceMatchThreshold: environmentVariables.confidence_threshold,
			Image: {
				Bytes: face
			},
			MaxFaces: 1
		}
		faceSearchPromises.push(
			rekognition.searchFacesByImage(paramsSearch).promise()
			.catch(error => {
				//--- This error is typically caused when Rekognition service does not find any faces in the image. We will ignore this.
				console.log(error)
			})
		)
	})
	try {
		const foundFaces = await Promise.all(faceSearchPromises)
		return foundFaces.filter(faceSearchResponse => faceSearchResponse && faceSearchResponse.FaceMatches && faceSearchResponse.FaceMatches.length)
			.map(faceSearchResponse => {
				if (faceSearchResponse && faceSearchResponse.FaceMatches &&
					faceSearchResponse.FaceMatches[0] && Object.prototype.hasOwnProperty.call(faceSearchResponse.FaceMatches[0], 'Face')) {
					//let faceid = faceSearchResponse.FaceMatches[0].Face.FaceId
					let externalImg = faceSearchResponse.FaceMatches[0].Face.ExternalImageId
					externalImg = externalImg.replace(new RegExp(replacementText, 'g'), ' ')
					return externalImg
				}
			})
	} catch (error) {
		//--- Ignoring cases when Rekognition throws errors saying searched image does not face
		console.log(error)
	}

}

/* 
	This function takes the id passed to it and returns the id that can be saved as external id when indexing faces. 
	Refer to indexFace function.
*/
const getExternalId = id => {
	let externalId = id.substring(id.indexOf(':') + 1, id.length)
	externalId = externalId.replace(new RegExp(' ', 'g'), replacementText)
	return externalId
}

/****************************General Utility Functions - Not needed for the main application ********************************** */

/* 
	Utility function that uploads the image to cloudinary and then indexes it via rekognition service
	This function can be used 
*/
exports.uploadAndIndex = async (url, label) => {
	try {
		const response = await cld.upload(url, environmentVariables.trainingFolder, label)
		indexFace(response.public_id, getExternalId(label), response.secure_url)
	} catch (error) {
		console.log("Error during upload for index ", error)
		throw error
	}
}

/* 
	Utility function that reindexes all images of a given folder in Cloudinary. This first deletes existing collection, creates a new
	one and indexes all images found within the folder via rekognition service
	This function can be used 
		1) if you already had a folder with images that you want to index
		2) if you want to delete the old collection and reindex all the assets
*/
exports.indexFaces = async (folderName) => {
	try {
		const deleteResponse = await rekognition.deleteCollection({
				CollectionId: environmentVariables.rekognitionCollection
			}).promise()
			.catch(error => {
				console.log(error)
			})
		console.log('Deleted collection - ', deleteResponse)

		const createResponse = await rekognition.createCollection({
			CollectionId: environmentVariables.rekognitionCollection
		}).promise()
		console.log("Collection created ", createResponse)

		const assets = await cld.retrieveResources(folderName, 'upload', 'image')
		console.log('Total images to index - ', assets.length)
		assets.forEach(asset => {
			if (asset.tags && asset.tags.length) {
				const tags = asset.tags
				tags.forEach(tag => {
					if (tag.startsWith(environmentVariables.faceLabelTagPrefix)) {
						const externalId = getExternalId(tag)
						console.log("external id is ", externalId)
						indexFace(asset.public_id, externalId, asset.secure_url)
					} else {
						console.log("No faceLabel tag found for ", asset.secure_url)
					}
				})
			} else {
				console.log("No tag found for ", asset.secure_url)
			}
		})
	} catch (error) {
		console.log("Re-index failed ", error)
		throw error
	}
}