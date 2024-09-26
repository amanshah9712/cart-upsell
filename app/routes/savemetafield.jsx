import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const requestData = await request.clone().json(); // Clone the request object
  const { productId, productData } = requestData;
  
  const { admin } = await authenticate.admin(request);
  console.log("productData13", productData);

  try {
    // Fetch shop details for metafield ownerId
    const response = await admin.graphql(`
      query {
        shop {
          id
          name
          email
          myshopifyDomain
        }
      }
    `);

    const responseBody = await response.json();
    const shopData = responseBody.data.shop;

    // Extract image URL and other relevant product data
    // const imageUrl = productData.images?.edges[0]?.node.originalSrc || "";
    // const title = productData.title || "No Title";
    // const price = productData.variants?.edges[0]?.node.price || "No Price";

    // Metafield mutation with selected product data
    const metafieldUpdateResponse = await admin.graphql(`
      mutation {
        metafieldsSet(metafields: [
          {
            ownerId: "${shopData.id}",  
            namespace: "custom-data",
            key: "product-details",
            value: ${JSON.stringify(productData)},
            type: "json" 
          }
        ]) {
          metafields {
            id
          }
        }
      }
    `);

    console.log("metafieldUpdateResponse", metafieldUpdateResponse);
    return json({ success: true, metafieldUpdateResponse });
  } catch (error) {
    console.error("Error saving metafield:", error);
    return json({ error: error.message }, { status: 500 });
  }
};
