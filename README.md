# Cloudinary Face Rekognition
This app recognizes faces in images that are uploaded to Cloudinary and will auto tag images with their names. It uses Amazon Rekognition Service to index and detect the faces.

The app leverages the following services for auto-tagging images:
- [**Cloudinary**](https://cloudinary.com): For uploading, tagging, and managing images.
- [**Amazon Rekognition**](https://aws.amazon.com/rekognition/): For indexing facial images and searching them for facial matches.
- [**AWS Lambda**](https://aws.amazon.com/lambda/): For calling Amazon Rekognition APIs for indexing and searching.
- [**Amazon API Gateway**](https://aws.amazon.com/api-gateway/): For exposing the Lambda function through API, which Cloudinary then registers as a web hook.

## Two workflows are involved:

#### 1. Creation of a trained collection
This flow takes the images uploaded to Cloudinary, invokes Amazon Rekognition, which then indexes the faces and stores them into a Amazon Rekognition collection.

![Index Flow](https://cloudinary-res.cloudinary.com/image/upload/blog/face-recognition/indexing-flow.jpg)

#### 2. Search of images in the trained collection
This flow takes the images uploaded to Cloudinary, invokes Amazon Rekognition, and searches for the faces in those images that match the indexed faces in the trained collection.

![Search Flow](https://cloudinary-res.cloudinary.com/image/upload/blog/face-recognition/search-flow.jpg)

## Configuring the app
Follow the steps below to configure and deploy the app.

As a preliminary step, register for an [AWS account](https://aws.amazon.com/account/) and a [free Cloudinary account](https://cloudinary.com/users/register/free).


### Setting up the AWS Environment
#### Configuring Lambda
You must deploy the app as a Lambda function on a latest version of Node.js runtime. Details on building Lambda Functions with Node.js can be found at - https://docs.aws.amazon.com/lambda/latest/dg/programming-model.html

Follow these steps to deploy the app on lambda:

1. Clone the project
2. `cd cloudinary-face-rekognition/lambda`
3. `npm i`
4. If you need to deploy this app to a Linux environemnt and if the app is packaged on non-Linux machines such as OS X and Windows, run the commands below. This will setup Sharp module (requied for face extraction from images) for Linux environment. Additional details at - https://github.com/lovell/sharp/blob/master/docs/install.md

    `rm -rf node_modules/sharp`
    
    `npm install --arch=x64 --platform=linux --target=10.15.0 sharp`
    
5. `zip -r cloudinary-face-rekog.zip cld-utils.js index.js node_modules/`
6. Upload the zip file to Lambda function
7. Ensure that ‘Execution role’ on the Lambda function has the `AmazonRekognitionFullAccess` policy attached.
8. Set the Lambda timeout to 1 minute and memory to 512 MB. You can tweak these values as needed.


The lambda function requires the following environment variables :

- **`CLOUDINARY_URL`:** The URL that is required for making API calls to Cloudinary. To look up that URL, log in to Cloudinary and go to its [Console](https://cloudinary.com/console) for the value.

- **`trainingFolder`:** The name of the Cloudinary folder, for example, `training`, in which to upload images. Amazon Rekognition will index the faces from this folder.

- **`faceRecognitionFolder`:** The name of the Cloudinary folder, for example, `assets`, in which to upload images for searches. 

- **`rekognitionCollection`:** The name of the collection in Amazon Rekognition, for example, `cld-rekog`, which contains the indexed faces to be used for face searches.

- **`confidenceThreshold`:** The minimum confidence-score of face matches, for example, `80`. The app considers a match successful if the score returned by Amazon Rekognition is at or higher than this level. 

- **`faceLabelTagPrefix`:** The prefix that precedes the names of the tagged images in the `training` folder. The tagging syntax is `faceLabelTagPrefix:< Name>`, for
example, `faceLabel:John Doe`.

- **`transformationParams`:** The parameters that specify the transformations to apply when requesting images from Cloudinary for indexing or searching. Because original-sized images are not required for indexing or searching, I recommend that you apply, at a minimum, `q_auto` to reduce the image size and save bandwidth.

    If needed, additional image transformations can be separated by commas, such as - `q_auto,w_900,h_900`. See transformation details at [Cloudinary Transformation](https://cloudinary.com/documentation/image_transformations)

    ![Lambda Env Variables](https://cloudinary-res.cloudinary.com/image/upload/blog/face-recognition/lambda-env-variables.jpg)

#### Configuring API Gateway
Cloudinary integrates with Amazon Rekognition through the Amazon API Gateway. Follow these steps:

1. In the API Gateway console, import the Swagger file `api/rekog_api.yaml` to set up your API by following this [procedure](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-import-api.html).

2. Associate the Lambda function created in step 1 with your API, like this:

    ![API Gateway Setup](https://cloudinary-res.cloudinary.com/image/upload/blog/face-recognition/api-gateway-setup.jpg)

### Setting Up the Cloudinary Environment
Next, set up your Cloudinary environment:

1. Log in to your Cloudinary account and go to your [Media Library](https://cloudinary.com/console/media_library/folders/all/). In the root folder, create two folders called ‘training’ and `assets`.

2. Go to  [**Upload Settings**](https://cloudinary.com/console/settings/upload) and enter in the **Notification URL** field the API Gateway endpoint you configured above. Cloudinary sends upload and tagging notifications to this endpoint, a requirement for this app.

    ![Cloudinary Settings](https://cloudinary-res.cloudinary.com/image/upload/blog/face-recognition/cloudinary-settings.jpg)

## Using the app
Now that all the components are in place, you can start using the app. First, set up a trained collection by indexing your facial images with Amazon Rekognition. In order to do this, all you have to do is upload them to the `training` folder.

**Note**  To create a trained collection, upload single-face images only to the `training` folder. Multiple-face images are not supported for this app.

You can upload images to Cloudinary in several ways. The steps below do that with the upload widget in the Cloudinary Console :

1. Go to your [Cloudinary Media Library](https://cloudinary.com/console/media_library).
2. Navigate to the ‘training’ folder
3. Click **Upload** on the top right-hand corner.
4. Click the **Advanced** link at the bottom of the upload widget that is displayed.
5. Enter a tag according to the syntax `faceLabel:<Name>, for example, `faceLabel:John Doe`.
6. Click to select an image to upload from any of the sources available on the upload widget.
![Upload Example](https://cloudinary-res.cloudinary.com/image/upload/blog/face-recognition/upload-example.jpg)

Repeat the above procedure to train all the images you’re targeting for facial recognition. 

Alternatively, you can upload training images in bulk through Cloudinary’s SDK. This doesn’t require Lambda Function and can be done from any NodeJS environment. Just ensure the node modules are installed and environment variables as stated above are defined.

* If your trainable images that are tagged with `faceLabel:<name>` are already in a training folder, call the `indexFaces` function on `index.js`. That function the accepts the training folder name, retrieves all the images from the folder, and indexes the ones with the `faceLabel` tag, as in this code:

	```javascript
    const cld_rekog = require('./index')
	cld_rekog.indexFaces('training/');
    ```

* If you have a list of the URLs and tags for all your images, call the `uploadAndIndex` function. That function then uploads the images, one by one, to Cloudinary, tagging and indexing them during the process. See this code:

```javascript
const cld_rekog = require('./index')
// Assume we have three entries to upload and index as below
const imageData = [{
            url: 'https://cloudinary-res.cloudinary.com/image/upload/q_auto/profile_marissa_masangcay.jpg',
            tag: 'faceLabel:Marissa Masangcay'
        },
        {
            url: 'https://cloudinary-res.cloudinary.com/image/upload/q_auto/profile_shirly_manor.jpg',
            tag: 'faceLabel:Shirly Manor'
        },
        {
            url: 'https://cloudinary-res.cloudinary.com/image/upload/q_auto/profile_tal_admon.jpg',
            tag: 'faceLabel:Tal Admon'
        }
    ]

imageData.forEach(data => {
    indexer.uploadAndIndex(data.url, data.tag)
})
```

Amazon Rekognition yields fairly good results with one trained image per person. By indexing different images of the same person, however, you can grow your collection and make it robust in enabling you to search for different images of people at a certain angle, of a certain pose, with a certain expression, and so forth.

Additionally, Amazon Rekognition returns many details that pertain to indexed faces, such as facial coordinates, poses, and such, which you could use in apps. To learn the specifics, see [the related documentation for Amazon Rekognition](https://docs.aws.amazon.com/rekognition/latest/dg/API_IndexFaces.html#API_IndexFaces_ResponseSyntax).

Subsequent to an image upload, the following takes place:

1. Cloudinary invokes the API Gateway endpoint defined in the **Notification URL** field in the **Upload Settings** screen of your Cloudinary Media Library. 
2. The API Gateway invokes the Lambda function with image-upload data from Cloudinary. 
3. The Lambda function checks the upload response and, if it verifies that the image has been uploaded to the `training` folder with a `faceLabel` tag, indexes the image via Amazon Rekognition. 

Once indexing is complete, `faceId` is displayed as an image tag, such as the one below. Refresh the page to see `faceId`.
![Index and Upload Example 1](https://cloudinary-res.cloudinary.com/image/upload/blog/face-recognition/uploaded-and-indexed.jpg)


## Testing the App
Finally, test the app. Start by uploading images into the `assets` folder. Feel free to upload multiface images in addition to single-face ones. If face matches are found, the app shows the related names as tags on the images. The entire process usually takes several seconds for images with a few faces and upto 25-30 seconds for images that contain many faces.

Refresh the page to see the tags.

These two screenshots are examples of a successful facial tagging: 

![Example 1](https://cloudinary-res.cloudinary.com/image/upload/blog/face-recognition/tagged-image-1.jpg)

![Example 2](https://cloudinary-res.cloudinary.com/image/upload/blog/face-recognition/tagged-image-2.jpg)


## Few things to note
1. Amazon Rekognition can detect up to 100 of the largest faces in an image. If there are more, Amazon Rekognition skips detecting some faces. See the details in the https://docs.aws.amazon.com/rekognition/latest/dg/faces-detect-images.html.
2. This app does not focus on security. Please follow guidelines below to implement security 
   1. In order to validate if the incoming request to Lambda function is from Cloudinary please see https://cloudinary.com/documentation/upload_images#verifying_notification_signatures
   2. In order to control access to API on API Gateway please see https://docs.aws.amazon.com/apigateway/latest/developerguide/permissions.html
3. Complete error handling and notification in event of any error is not done. Please add appropriate error handling as necessary.
